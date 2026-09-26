'use client';

import React, { useEffect, useState } from 'react';

interface StatsResponse {
  espOnline: boolean;
  lastEspPing: string | null;
  pendingCount: number;
  totalDispensedCount: number;
  totalCollected: number;
  history: Array<{
    id: string;
    amount: number;
    source: 'mercadopago' | 'simulation';
    status: 'PENDING' | 'DISPENSED';
    createdAt: string;
    dispensedAt?: string;
  }>;
  config: {
    hasToken: boolean;
    minAmount: string;
    pulseCount: string;
    pulseDurationMs: string;
  };
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Erro buscando status:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulate = async (amount = 1.0) => {
    setSimulating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`✅ Pagamento simulado de R$ ${amount.toFixed(2)} enviado! Aguardando o ESP8266 acionar o relé...`);
        fetchStats();
      } else {
        setFeedback(`❌ Erro: ${data.error}`);
      }
    } catch (e: any) {
      setFeedback(`❌ Falha de conexão: ${e.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '--:--:--';
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR');
  };

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00d4ff, #0070f3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)'
            }}>
              💧
            </div>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                Chafariz <span style={{ color: '#00d4ff' }}>Pix</span> IoT
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Central de Controle • ESP8266 & Mercado Pago
              </p>
            </div>
          </div>
        </div>

        {/* ESP Status Badge */}
        <div className="glass-panel" style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`live-indicator ${stats?.espOnline ? 'online' : 'offline'}`} />
          <span style={{ fontSize: '14px', fontWeight: 600 }}>
            ESP8266: {stats?.espOnline ? (
              <strong style={{ color: 'var(--accent-emerald)' }}>ONLINE</strong>
            ) : (
              <strong style={{ color: 'var(--accent-rose)' }}>AGUARDANDO PING</strong>
            )}
          </span>
          {stats?.lastEspPing && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              ({formatTime(stats.lastEspPing)})
            </span>
          )}
        </div>
      </header>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* Card 1: Fila de Liberação */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>Fila de Água</span>
            <span style={{ fontSize: '20px' }}>⏳</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: (stats?.pendingCount || 0) > 0 ? '#f59e0b' : '#f8fafc' }}>
            {stats?.pendingCount || 0}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {(stats?.pendingCount || 0) > 0 ? 'Pagamentos aguardando pulso no relé' : 'Nenhuma liberação pendente'}
          </p>
        </div>

        {/* Card 2: Total Liberado */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>Acionamentos Concluídos</span>
            <span style={{ fontSize: '20px' }}>🚿</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--accent-cyan)' }}>
            {stats?.totalDispensedCount || 0}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Ciclos de água liberados com sucesso
          </p>
        </div>

        {/* Card 3: Total Arrecadado */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>Total Arrecadado</span>
            <span style={{ fontSize: '20px' }}>💰</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--accent-emerald)' }}>
            R$ {(stats?.totalCollected || 0).toFixed(2)}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Valor total registrado nas ativações
          </p>
        </div>

        {/* Card 4: Mercado Pago Status */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>Mercado Pago</span>
            <span style={{ fontSize: '20px' }}>💳</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>
            {stats?.config?.hasToken ? (
              <span style={{ color: 'var(--accent-emerald)' }}>CONECTADO</span>
            ) : (
              <span style={{ color: 'var(--accent-amber)' }}>MODO TESTE</span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {stats?.config?.hasToken ? 'Webhook e API ativos' : 'Token não inserido no .env.local'}
          </p>
        </div>
      </div>

      {/* Action Banner: Simulador de Bancada */}
      <section className="glass-panel" style={{
        padding: '24px',
        marginBottom: '28px',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(0, 112, 243, 0.08))',
        border: '1px solid rgba(0, 212, 255, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
              🧪 Simulador de Bancada (Teste Imediato)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '600px' }}>
              Teste o acionamento do relé no seu ESP8266 agora mesmo, sem gastar 1 centavo e sem precisar pagar via Pix real.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => handleSimulate(1.0)}
              disabled={simulating}
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #0070f3 100%)',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: simulating ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 18px rgba(0, 212, 255, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              {simulating ? 'Enviando...' : '🌊 Simular Pix R$ 1,00 (Liberar Água)'}
            </button>
          </div>
        </div>

        {feedback && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '14px',
          }}>
            {feedback}
          </div>
        )}
      </section>

      {/* Main Content: Logs & Guide */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        {/* Histórico Recente */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📋 Histórico de Ativações
          </h2>

          {(!stats?.history || stats.history.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              Nenhum pagamento registrado ainda. Clique no botão de simulação acima para testar!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stats.history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>
                      R$ {item.amount.toFixed(2)}
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        marginLeft: '8px',
                        background: item.source === 'mercadopago' ? 'rgba(0, 112, 243, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: item.source === 'mercadopago' ? '#38bdf8' : '#fbbf24',
                      }}>
                        {item.source === 'mercadopago' ? 'Mercado Pago' : 'Simulação'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      ID: {item.id} • {formatTime(item.createdAt)}
                    </div>
                  </div>

                  <div>
                    {item.status === 'PENDING' ? (
                      <span style={{ color: 'var(--accent-amber)', fontSize: '13px', fontWeight: 700 }}>
                        ⏳ Na fila
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-emerald)', fontSize: '13px', fontWeight: 700 }}>
                        ✅ Liberado {item.dispensedAt ? `(${formatTime(item.dispensedAt)})` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Guia Rápido de Configuração */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚙️ Instruções de Ligação do Hardware
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px' }}>
            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <strong style={{ color: 'var(--accent-cyan)' }}>Pino do Relé no ESP8266:</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                Conecte o pino <strong>IN</strong> do Módulo Relé no pino <strong>D2 (GPIO 4)</strong> do ESP8266 (NodeMCU / D1 Mini).
              </p>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <strong style={{ color: 'var(--accent-cyan)' }}>Alimentação do Relé:</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                Conecte o <strong>VCC</strong> do relé no pino <strong>VIN / 5V</strong> do ESP8266 e o <strong>GND</strong> no <strong>GND</strong>.
              </p>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <strong style={{ color: 'var(--accent-cyan)' }}>Chafariz / Válvula Solenoide:</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                Ligue a válvula de água passando um dos fios pelos contatos <strong>COM (Comum)</strong> e <strong>NO (Normalmente Aberto)</strong> do relé.
              </p>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <strong style={{ color: 'var(--accent-emerald)' }}>Configuração dos Pulsos:</strong>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                Configurado para: <strong>{stats?.config?.pulseCount || 2} pulsos</strong> de <strong>{(Number(stats?.config?.pulseDurationMs || 1000) / 1000).toFixed(1)}s</strong>. (Ajustável no arquivo <code>.env.local</code> ou no firmware).
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
