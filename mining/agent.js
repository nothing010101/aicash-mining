/**
 * AI CASH Mining Agent - Luna
 * Wallet: 0xad2c395d733e73738b2a6e8e90a41fc082cfca2d
 * 
 * Run: node agent.js
 * Requires: Node.js (no external dependencies)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ENDPOINT_HOST = 'wzpyveiuaxzldtaarfvt.supabase.co';
const ENDPOINT_PATH = '/functions/v1/mining-submit';
const WALLET = '0xad2c395d733e73738b2a6e8e90a41fc082cfca2d';
const STATS_FILE = path.join(__dirname, 'stats.json');

// Agent configuration - change API key here if needed
const AGENT = {
  name: 'Luna',
  apiKey: 'cash_8b25071268297cb700736e59ead110378e80a75f34a00af166fdb7001e4653a6',
};

// ============================================================
// Stats tracking
// ============================================================
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) {}
  return { blocksMinedTotal: 0, cashEarned: 0, errors: 0, lastBlock: null, lastSuccess: null, lastError: null, status: 'idle', startTime: null };
}

function saveStats(s) {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); } catch (e) {}
}

// ============================================================
// HTTP request using native Node.js https
// ============================================================
function submitBlock(apiKey, blockNumber) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ block_number: blockNumber });
    const options = {
      hostname: ENDPOINT_HOST,
      path: ENDPOINT_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    let responded = false;
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (responded) return;
        responded = true;
        try {
          const json = JSON.parse(data);
          if (json.error) resolve({ ok: false, error: json.error });
          else resolve({ ok: true, data: json });
        } catch (e) {
          resolve({ ok: false, error: data.substring(0, 100) || 'parse_error' });
        }
      });
    });

    req.on('error', (e) => {
      if (responded) return;
      responded = true;
      resolve({ ok: false, error: e.message || 'network_error' });
    });

    // 3 minute timeout
    const timer = setTimeout(() => {
      if (responded) return;
      responded = true;
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    }, 180000);

    req.on('close', () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

// ============================================================
// Error parsing helpers
// ============================================================
function parseCurrentBlock(msg) {
  const m = String(msg).match(/Current block is #(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function parseWaitSec(msg) {
  const m = String(msg).match(/Wait (\d+)s/);
  return m ? parseInt(m[1]) : null;
}

function isInvalidKey(msg) {
  return String(msg).toLowerCase().includes('invalid') && String(msg).toLowerCase().includes('key');
}

// ============================================================
// Main mining loop
// ============================================================
async function main() {
  const stats = loadStats();
  stats.status = 'running';
  stats.startTime = new Date().toISOString();
  stats.errors = 0;
  stats.lastError = null;
  saveStats(stats);

  console.log('');
  console.log('================================');
  console.log('  AI CASH MINING AGENT - LUNA');
  console.log('================================');
  console.log('Wallet : ' + WALLET);
  console.log('Network: Base L2 (Chain 8453)');
  console.log('Reward : 100K $CASH per block');
  console.log('================================');
  console.log('');

  let currentBlock = 1312; // Will be updated from API

  while (true) {
    process.stdout.write(`[Luna] Submitting block #${currentBlock}... `);
    stats.status = 'mining';

    const result = await submitBlock(AGENT.apiKey, currentBlock);

    if (result.ok) {
      // SUCCESS
      const reward = result.data?.reward?.amount
        || result.data?.amount
        || result.data?.blocks_mined_reward
        || 100000;

      stats.blocksMinedTotal++;
      stats.cashEarned = (stats.cashEarned || 0) + reward;
      stats.lastBlock = currentBlock;
      stats.lastSuccess = new Date().toISOString();
      stats.lastReward = reward;
      stats.status = 'mining';

      console.log('SUCCESS!');
      console.log('');
      console.log('╔══════════════════════════════════╗');
      console.log('║  ✅ BLOCK MINED!                  ║');
      console.log('╠══════════════════════════════════╣');
      console.log('║  Block  : #' + String(currentBlock).padEnd(22) + '║');
      console.log('║  Reward : ' + String(reward.toLocaleString() + ' $CASH').padEnd(23) + '║');
      console.log('║  Total  : ' + String(stats.blocksMinedTotal + ' blocks').padEnd(23) + '║');
      console.log('║  Earned : ' + String(stats.cashEarned.toLocaleString() + ' $CASH').padEnd(23) + '║');
      console.log('╚══════════════════════════════════╝');
      console.log('');

      currentBlock++;
      saveStats(stats);

    } else {
      const err = result.error;

      // Invalid API key
      if (isInvalidKey(err)) {
        console.log('INVALID API KEY!');
        console.log('');
        console.log('ERROR: API key is invalid or expired.');
        console.log('Get a new soul.md at: https://www.aicash.network/#get-soul');
        console.log('Then update AGENT.apiKey in agent.js');
        process.exit(1);
      }

      // Rate limited
      const waitSec = parseWaitSec(err);
      if (waitSec !== null) {
        console.log('rate limited');
        console.log('[Luna] Waiting ' + waitSec + 's...');
        stats.status = 'waiting';
        saveStats(stats);
        await new Promise(r => setTimeout(r, (waitSec + 1) * 1000));
        continue;
      }

      // Block out of range
      const cb = parseCurrentBlock(err);
      if (cb !== null) {
        if (err.includes('future')) {
          console.log('future block');
          console.log('[Luna] Block #' + currentBlock + ' is in future, current=#' + cb);
          currentBlock = cb;
        } else {
          console.log('old block');
          console.log('[Luna] Block #' + currentBlock + ' too old, syncing to #' + cb);
          currentBlock = cb;
        }
        continue;
      }

      // Already mined
      if (err.includes('already mined')) {
        console.log('already mined, skipping');
        currentBlock++;
        continue;
      }

      // Timeout or network error
      if (err === 'timeout' || err === 'network_error') {
        console.log(err);
        console.log('[Luna] Retrying in 15s...');
        stats.errors++;
        stats.lastError = err;
        stats.status = 'error';
        saveStats(stats);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }

      // Other errors
      console.log('error');
      console.log('[Luna] Error: ' + err);
      stats.errors++;
      stats.lastError = err;
      stats.status = 'error';
      saveStats(stats);
      currentBlock++;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
