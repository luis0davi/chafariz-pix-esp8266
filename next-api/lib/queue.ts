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

const DATA_FILE = path.join(process.cwd(), 'data', 'store.json');

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      queue: [],
      history: [],
      lastEspPing: null,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

function readData(): { queue: PaymentItem[]; history: PaymentItem[]; lastEspPing: string | null } {
  try {
    ensureDataFile();
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
export function enqueuePayment(id: string, amount: number, source: 'mercadopago' | 'simulation' = 'mercadopago'): PaymentItem {
  const data = readData();

  // Verifica se já não foi processado
  const existing = data.history.find(p => p.id === id) || data.queue.find(p => p.id === id);
  if (existing) {
    return existing;
  }

  const newItem: PaymentItem = {
    id,
    amount,
    source,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  data.queue.push(newItem);
  writeData(data);
  return newItem;
}

// Retorna o próximo pagamento a ser liberado pelo ESP8266
export function getNextPendingPayment(): PaymentItem | null {
  const data = readData();
  if (data.queue.length === 0) return null;
  return data.queue[0];
}

// Confirma que a água foi liberada e move para o histórico
export function confirmDispense(id: string): boolean {
  const data = readData();
  const index = data.queue.findIndex(p => p.id === id);
  if (index === -1) {
    // Se já estiver no histórico como DISPENSED, retorna true (idempotente)
    const inHistory = data.history.find(p => p.id === id);
    if (inHistory && inHistory.status === 'DISPENSED') {
      return true;
    }
    return false;
  }

  const item = data.queue.splice(index, 1)[0];
  item.status = 'DISPENSED';
  item.dispensedAt = new Date().toISOString();

  // Adiciona ao topo do histórico (máximo 50 itens)
  data.history.unshift(item);
  if (data.history.length > 50) {
    data.history = data.history.slice(0, 50);
  }

  writeData(data);
  return true;
}

// Registra que o ESP8266 se comunicou (heartbeat)
export function pingEsp(): void {
  const data = readData();
  data.lastEspPing = new Date().toISOString();
  writeData(data);
}

// Retorna as estatísticas do sistema
export function getSystemStats(): SystemStats {
  const data = readData();
  const now = Date.now();
  const lastPingTime = data.lastEspPing ? new Date(data.lastEspPing).getTime() : 0;

  // Se o ESP mandou ping nos últimos 10 segundos, consideramos online
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
