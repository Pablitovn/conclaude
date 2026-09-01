// ============================================================
// 00-web-workers.js — Worker runtime controlado y explícito
// Sin eval(), sin reutilización de workers ocupados y con cola real.
// ============================================================
(function (global) {
  "use strict";

  const LGMDM = global.LGMDM = global.LGMDM || {};
  const pools = new Map();
  let taskId = 0;
  const DEFAULT_TIMEOUT = 30000;
  const MAX_WORKERS = Math.max(1, Math.min(4, Number(global.navigator?.hardwareConcurrency || 2)));

  const TASKS = {
    analyzeAudio(data) {
      let mean = 0;
      for (let i = 0; i < data.length; i += 1) mean += data[i];
      mean /= data.length || 1;
      let variance = 0;
      let rmsAcc = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = Number(data[i]) || 0;
        const d = v - mean;
        variance += d * d;
        rmsAcc += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      return { mean, stdDev: Math.sqrt(variance / (data.length || 1)), peak, rms: Math.sqrt(rmsAcc / (data.length || 1)) };
    },
    calculateSpectrum(buffer, size) {
      // Placeholder determinista: el FFT real vive en los analizadores/backend.
      const out = new Array(Math.max(1, Number(size) || 2048));
      for (let i = 0; i < out.length; i += 1) out[i] = 0;
      return out;
    },
    compressData(data) {
      if (!data?.length) return [];
      const compressed = [];
      let current = data[0], count = 1;
      for (let i = 1; i < data.length; i += 1) {
        if (data[i] === current) count += 1;
        else { compressed.push([current, count]); current = data[i]; count = 1; }
      }
      compressed.push([current, count]);
      return compressed;
    },
    identity(value) { return value; },
    mapNumber(value, args) {
      const [operation] = Array.isArray(args) ? args : [];
      if (operation === 'square') return Number(value) * Number(value);
      if (operation === 'abs') return Math.abs(Number(value));
      return value;
    },
  };

  const TASK_SOURCES = Object.fromEntries(Object.entries(TASKS).map(([name, fn]) => [name, fn.toString()]));

  function createWorker(taskName) {
    if (!TASK_SOURCES[taskName]) throw new Error(`Worker task no registrada: ${taskName}`);
    const workerCode = `
      "use strict";
      const TASK = ${TASK_SOURCES[taskName]};
      self.onmessage = async (event) => {
        const { id, args } = event.data || {};
        try {
          const result = await TASK(...(Array.isArray(args) ? args : []));
          self.postMessage({ id, result, error: null });
        } catch (error) {
          self.postMessage({ id, result: null, error: error?.message || String(error) });
        }
      };
    `;
    const url = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
    const worker = new Worker(url);
    worker.__lgmdmUrl = url;
    return worker;
  }

  function disposeWorker(worker) {
    if (!worker) return;
    try { worker.terminate(); } catch (_) {}
    if (worker.__lgmdmUrl) {
      try { URL.revokeObjectURL(worker.__lgmdmUrl); } catch (_) {}
      worker.__lgmdmUrl = null;
    }
  }

  function poolFor(name) {
    let pool = pools.get(name);
    if (!pool) {
      pool = { name, available: [], busy: new Set(), queue: [], workers: new Set() };
      pools.set(name, pool);
    }
    return pool;
  }

  function createTask(pool, args, timeout) {
    return new Promise((resolve, reject) => pool.queue.push({ id: ++taskId, args, timeout, resolve, reject }));
  }

  function pump(pool) {
    while (pool.queue.length && pool.busy.size < MAX_WORKERS) {
      const task = pool.queue.shift();
      const worker = pool.available.pop() || createWorker(pool.name);
      pool.workers.add(worker);
      pool.busy.add(worker);
      const timer = global.setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        pool.busy.delete(worker);
        pool.workers.delete(worker);
        disposeWorker(worker);
        task.reject(Object.assign(new Error(`Worker timeout: ${pool.name}`), { name: 'TimeoutError' }));
        pump(pool);
      }, task.timeout);
      const finish = (cb) => {
        global.clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        pool.busy.delete(worker);
        pool.available.push(worker);
        cb();
        pump(pool);
      };
      const onMessage = (event) => {
        const payload = event.data || {};
        finish(() => payload.error ? task.reject(new Error(payload.error)) : task.resolve(payload.result));
      };
      const onError = (error) => finish(() => {
        pool.workers.delete(worker);
        disposeWorker(worker);
        task.reject(error instanceof Error ? error : new Error('Worker error'));
      });
      worker.addEventListener('message', onMessage, { once: true });
      worker.addEventListener('error', onError, { once: true });
      worker.postMessage({ id: task.id, args: task.args });
    }
  }

  const WorkerPool = {
    run(taskName, args = [], timeout = DEFAULT_TIMEOUT) {
      if (!TASK_SOURCES[taskName]) return Promise.reject(new Error(`Worker task no registrada: ${taskName}`));
      const pool = poolFor(taskName);
      const promise = createTask(pool, args, Math.max(1, Number(timeout) || DEFAULT_TIMEOUT));
      pump(pool);
      return promise;
    },
    runPooled(name, taskName, args = [], timeout = DEFAULT_TIMEOUT) {
      if (typeof taskName !== 'string') return Promise.reject(new TypeError('runPooled requiere el nombre de una tarea registrada'));
      return this.run(taskName, args, timeout);
    },
    registerTask() {
      throw new Error('Las tareas de worker son cerradas y deben declararse en 00-web-workers.js');
    },
    terminateAll() {
      for (const pool of pools.values()) {
        for (const worker of pool.workers) disposeWorker(worker);
        for (const task of pool.queue) task.reject(new Error('Worker pool terminado'));
        pool.workers.clear(); pool.available = []; pool.busy.clear(); pool.queue = [];
      }
      pools.clear();
    }
  };

  const WorkerTasks = {
    analyzeAudio(audioData) { return WorkerPool.run('analyzeAudio', [audioData]); },
    calculateSpectrum(audioBuffer, fftSize = 2048) { return WorkerPool.run('calculateSpectrum', [audioBuffer, fftSize]); },
    compressData(data) { return WorkerPool.run('compressData', [data]); },
    processArray(array, taskName = 'identity', taskArgs = []) {
      if (!Array.isArray(array)) return Promise.reject(new TypeError('processArray requiere un array'));
      if (typeof taskName !== 'string' || !TASK_SOURCES[taskName]) {
        return Promise.reject(new TypeError('processArray requiere una tarea registrada por nombre'));
      }
      return Promise.all(array.map((item) => WorkerPool.run(taskName, [item, taskArgs])));
    }
  };

  LGMDM.workers = { run: WorkerPool.run.bind(WorkerPool), tasksApi: WorkerTasks, tasks: Object.freeze(Object.keys(TASK_SOURCES)), maxWorkers: MAX_WORKERS };
  global.addEventListener('beforeunload', () => WorkerPool.terminateAll(), { once: true });
})(window);
