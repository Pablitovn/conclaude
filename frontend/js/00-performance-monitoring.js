// ============================================================
// 00-performance-monitoring.js — Web Vitals y monitoreo
// ============================================================

(function() {
  "use strict";

  const metrics = {
    pageLoadTime: 0,
    timeToFirstByte: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    cumulativeLayoutShift: 0,
    firstInputDelay: 0,
    interactions: [],
    resourceTimings: [],
    navigationTiming: null,
    customMetrics: {}
  };

  // Medir Web Vitals
  window.PerformanceMonitoring = {
    // Core Web Vitals
    init() {
      // Navigation Timing
      if (performance.timing) {
        const timing = performance.timing;
        metrics.navigationTiming = {
          pageLoadTime: timing.loadEventEnd - timing.navigationStart,
          timeToFirstByte: timing.responseStart - timing.navigationStart,
          domInteractive: timing.domInteractive - timing.navigationStart,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart
        };

        metrics.pageLoadTime = metrics.navigationTiming.pageLoadTime;
      }

      // Largest Contentful Paint (LCP)
      if ('PerformanceObserver' in window) {
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            metrics.largestContentfulPaint = lastEntry.renderTime || lastEntry.loadTime;
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {}

        // First Input Delay (FID)
        try {
          const fidObserver = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
              metrics.firstInputDelay = Math.min(
                metrics.firstInputDelay || entry.processingDuration,
                entry.processingDuration
              );
            });
          });
          fidObserver.observe({ entryTypes: ['first-input'] });
        } catch (e) {}

        // Cumulative Layout Shift (CLS)
        try {
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            });
            metrics.cumulativeLayoutShift = clsValue;
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {}

        // First Contentful Paint (FCP)
        try {
          const fcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach((entry) => {
              if (entry.name === 'first-contentful-paint') {
                metrics.firstContentfulPaint = entry.startTime;
              }
            });
          });
          fcpObserver.observe({ entryTypes: ['paint'] });
        } catch (e) {}
      }

      // Track resource timings
      this.trackResourceTimings();

      // Track user interactions
      this.trackInteractions();

      console.log("✅ Performance Monitoring iniciado");
    },

    // Rastrear timings de recursos
    trackResourceTimings() {
      if (!performance.getEntriesByType) return;

      setInterval(() => {
        const resources = performance.getEntriesByType('resource');
        resources.forEach((resource) => {
          if (!metrics.resourceTimings.find(r => r.name === resource.name)) {
            metrics.resourceTimings.push({
              name: resource.name,
              duration: resource.duration,
              size: resource.transferSize || 0,
              type: resource.initiatorType
            });
          }
        });
      }, 5000);
    },

    // Rastrear interacciones del usuario
    trackInteractions() {
      ['click', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, (e) => {
          metrics.interactions.push({
            type: event,
            timestamp: performance.now(),
            target: e.target?.tagName || 'unknown'
          });

          // Mantener últimas 100 interacciones
          if (metrics.interactions.length > 100) {
            metrics.interactions.shift();
          }
        }, { passive: true });
      });
    },

    // Medir métrica personalizada
    measure(name, startMark, endMark) {
      if (!performance.measure) return null;

      try {
        performance.measure(name, startMark, endMark);
        const measure = performance.getEntriesByName(name)[0];
        metrics.customMetrics[name] = measure.duration;
        return measure.duration;
      } catch (e) {
        console.error('Measurement failed:', e);
        return null;
      }
    },

    // Crear marca de tiempo
    mark(name) {
      if (performance.mark) {
        performance.mark(name);
      }
    },

    // Obtener todas las métricas
    getMetrics() {
      return {
        ...metrics,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };
    },

    // Obtener Core Web Vitals
    getVitals() {
      return {
        LCP: metrics.largestContentfulPaint,
        FID: metrics.firstInputDelay,
        CLS: metrics.cumulativeLayoutShift,
        FCP: metrics.firstContentfulPaint,
        TTFB: metrics.navigationTiming?.timeToFirstByte || 0,
        pageLoadTime: metrics.pageLoadTime
      };
    },

    // Enviar métricas al servidor
    reportMetrics(endpoint) {
      const vitals = this.getVitals();
      
      // Enviar después de que la página se cargue
      if (document.readyState === 'complete') {
        this._send(endpoint, vitals);
      } else {
        window.addEventListener('load', () => {
          setTimeout(() => this._send(endpoint, vitals), 1000);
        });
      }
    },

    _send(endpoint, data) {
      const payload = JSON.stringify(data);
      
      // Usar beacon si está disponible (más confiable)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, payload);
      } else {
        // Fallback a fetch
        fetch(endpoint, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true
        }).catch(() => {});
      }
    },

    // Obtener estadísticas de recursos
    getResourceStats() {
      return {
        totalResources: metrics.resourceTimings.length,
        totalSize: metrics.resourceTimings.reduce((a, r) => a + r.size, 0),
        avgDuration: metrics.resourceTimings.reduce((a, r) => a + r.duration, 0) / 
                     metrics.resourceTimings.length,
        byType: metrics.resourceTimings.reduce((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {})
      };
    },

    // Obtener estadísticas de interacciones
    getInteractionStats() {
      return {
        totalInteractions: metrics.interactions.length,
        byType: metrics.interactions.reduce((acc, i) => {
          acc[i.type] = (acc[i.type] || 0) + 1;
          return acc;
        }, {}),
        avgTimeBetween: this._avgTimeBetweenInteractions()
      };
    },

    _avgTimeBetweenInteractions() {
      if (metrics.interactions.length < 2) return 0;
      
      let totalTime = 0;
      for (let i = 1; i < metrics.interactions.length; i++) {
        totalTime += metrics.interactions[i].timestamp - metrics.interactions[i-1].timestamp;
      }
      return totalTime / (metrics.interactions.length - 1);
    },

    // Detectar problemas de performance
    diagnose() {
      const vitals = this.getVitals();
      const issues = [];

      if (vitals.LCP > 4000) issues.push("⚠️ LCP lento (>4s)");
      if (vitals.FID > 100) issues.push("⚠️ FID alto (>100ms)");
      if (vitals.CLS > 0.1) issues.push("⚠️ CLS alto (>0.1)");
      if (vitals.TTFB > 600) issues.push("⚠️ TTFB lento (>600ms)");
      if (vitals.pageLoadTime > 3000) issues.push("⚠️ Page load lento (>3s)");

      return {
        score: 100 - (issues.length * 10),
        issues,
        vitals
      };
    },

    // Mostrar dashboard en consola
    printDashboard() {
      const vitals = this.getVitals();
      const diagnosis = this.diagnose();
      const resources = this.getResourceStats();
      const interactions = this.getInteractionStats();

      console.log("╔══════════════════════════════════════╗");
      console.log("║ PERFORMANCE DASHBOARD                ║");
      console.log("╠══════════════════════════════════════╣");
      console.log(`║ Score: ${diagnosis.score}/100`);
      console.log("╠══════════════════════════════════════╣");
      console.log("║ CORE WEB VITALS:");
      console.log(`║ LCP: ${vitals.LCP.toFixed(0)}ms`);
      console.log(`║ FID: ${vitals.FID.toFixed(0)}ms`);
      console.log(`║ CLS: ${vitals.CLS.toFixed(3)}`);
      console.log(`║ FCP: ${vitals.FCP.toFixed(0)}ms`);
      console.log(`║ TTFB: ${vitals.TTFB.toFixed(0)}ms`);
      console.log("╠══════════════════════════════════════╣");
      console.log("║ RECURSOS:");
      console.log(`║ Total: ${resources.totalResources}`);
      console.log(`║ Tamaño: ${(resources.totalSize / 1024).toFixed(0)}KB`);
      console.log(`║ Avg Duration: ${resources.avgDuration.toFixed(0)}ms`);
      console.log("╠══════════════════════════════════════╣");
      console.log("║ ISSUES:");
      diagnosis.issues.forEach(issue => console.log(`║ ${issue}`));
      console.log("╚══════════════════════════════════════╝");
    }
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.PerformanceMonitoring.init();
    });
  } else {
    window.PerformanceMonitoring.init();
  }

  console.log("✅ Performance Monitoring cargado");
})();
