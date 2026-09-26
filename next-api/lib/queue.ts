import fs from 'fs';
import path from 'path';

export interface PaymentItem {
  id: string;
  amount: number;
  source: 'mercadopago' | 'simulation';
  status: 'PENDING' | 'DISPENSED';
  createdAt: string;
  dispensedAt?: string;
}

export interface SystemStats {
  espOnline: boolean;
  lastEspPing: string | null;
  pendingCount: number;
  totalDispensedCount: number;
  totalCollected: number;
  history: PaymentItem[];
}

// Suporte para Vercel Serverless (o diretório raiz na Vercel é somente-leitura, então usamos /tmp se estiver na Vercel)
const DATA_FILE = process.env.VERCEL
  ? path.join('/tmp', 'store.json')
  : path.join(process.cwd(), 'data', 'store.json');

// Suporte opcional ao Vercel KV / Upstash Redis (banco em nuvem gratuito de 1 clique na Vercel)
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(cmd: string[]): Promise<any> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/${cmd.map(c => encodeURIComponent(c)).join('/')}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    return data.result;
  } catch (e) {
    console.error('[Redis KV Error]:', e);
    return null;
  }
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      queue: [],
      history: [],
      lastEspPing: null,
    };
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    } catch {}
  }
}

function readData(): { queue: PaymentItem[]; history: PaymentItem[]; lastEspPing: string | null } {
  try {
    ensureDataFile();
    if (!fs.existsSync(DATA_FILE)) {
      return { queue: [], history: [], lastEspPing: null };
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { queue: [], history: [], lastEspPing: null };
  }
}

function writeData(data: { queue: PaymentItem[]; history: PaymentItem[]; lastEspPing: string | null }) {
  try {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro salvando store.json:', e);
  }
}

// Adiciona um pagamento aprovado para a fila de liberação de água
export async function enqueuePayment(id: string, amount: number, source: 'mercadopago' | 'simulation' = 'mercadopago'): Promise<PaymentItem> {
  const newItem: PaymentItem = {
    id,
    amount,
    source,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  if (KV_URL && KV_TOKEN) {
    const isProcessed = await redisCommand(['SISMEMBER', 'chafariz_processed_ids', id]);
    if (isProcessed === 1) return newItem;
    await redisCommand(['SADD', 'chafariz_processed_ids', id]);
    await redisCommand(['RPUSH', 'chafariz_queue', JSON.stringify(newItem)]);
    return newItem;
  }

  const data = readData();
  const existing = data.history.find(p => p.id === id) || data.queue.find(p => p.id === id);
  if (existing) return existing;

  data.queue.push(newItem);
  writeData(data);
  return newItem;
}

// Retorna o próximo pagamento a ser liberado pelo ESP8266
export async function getNextPendingPayment(): Promise<PaymentItem | null> {
  if (KV_URL && KV_TOKEN) {
    const raw = await redisCommand(['LINDEX', 'chafariz_queue', '0']);
    if (!raw) return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  const data = readData();
  if (data.queue.length === 0) return null;
  return data.queue[0];
}

// Confirma que a água foi liberada e move para o histórico
export async function confirmDispense(id: string): Promise<boolean> {
  if (KV_URL && KV_TOKEN) {
    const raw = await redisCommand(['LPOP', 'chafariz_queue']);
    let item: PaymentItem | null = null;
    if (raw) {
      try {
        item = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {}
    }
    if (!item) {
      item = {
        id,
        amount: 1.0,
        source: 'mercadopago',
        status: 'DISPENSED',
        createdAt: new Date().toISOString(),
      };
    }
    item.status = 'DISPENSED';
    item.dispensedAt = new Date().toISOString();
    await redisCommand(['LPUSH', 'chafariz_history', JSON.stringify(item)]);
    await redisCommand(['LTRIM', 'chafariz_history', '0', '49']);
    return true;
  }

  const data = readData();
  const index = data.queue.findIndex(p => p.id === id);
  if (index === -1) {
    const inHistory = data.history.find(p => p.id === id);
    if (inHistory && inHistory.status === 'DISPENSED') {
      return true;
    }
    return false;
  }

  const item = data.queue.splice(index, 1)[0];
  item.status = 'DISPENSED';
  item.dispensedAt = new Date().toISOString();

  data.history.unshift(item);
  if (data.history.length > 50) {
    data.history = data.history.slice(0, 50);
  }

  writeData(data);
  return true;
}

// Registra que o ESP8266 se comunicou (heartbeat)
export async function pingEsp(): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    await redisCommand(['SET', 'chafariz_last_ping', new Date().toISOString()]);
    return;
  }
  const data = readData();
  data.lastEspPing = new Date().toISOString();
  writeData(data);
}

// Retorna as estatísticas do sistema
export async function getSystemStats(): Promise<SystemStats> {
  if (KV_URL && KV_TOKEN) {
    const [queueLen, historyRaw, lastPing] = await Promise.all([
      redisCommand(['LLEN', 'chafariz_queue']),
      redisCommand(['LRANGE', 'chafariz_history', '0', '19']),
      redisCommand(['GET', 'chafariz_last_ping']),
    ]);

    const history: PaymentItem[] = (historyRaw || []).map((h: any) => {
      try {
        return typeof h === 'string' ? JSON.parse(h) : h;
      } catch {
        return null;
      }
    }).filter(Boolean);

    const now = Date.now();
    const lastPingTime = lastPing ? new Date(lastPing).getTime() : 0;
    const espOnline = (now - lastPingTime) < 10000;
    const totalCollected = history.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    return {
      espOnline,
      lastEspPing: lastPing,
      pendingCount: Number(queueLen) || 0,
      totalDispensedCount: history.length,
      totalCollected,
      history,
    };
  }

  const data = readData();
  const now = Date.now();
  const lastPingTime = data.lastEspPing ? new Date(data.lastEspPing).getTime() : 0;
  const espOnline = (now - lastPingTime) < 10000;
  const totalCollected = data.history.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return {
    espOnline,
    lastEspPing: data.lastEspPing,
    pendingCount: data.queue.length,
    totalDispensedCount: data.history.length,
    totalCollected,
    history: [...data.queue, ...data.history].slice(0, 20),
  };
}
