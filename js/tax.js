/**
 * tax.js — Módulo de Impuestos Nueva Zelanda
 * Control de Pintores PWA
 *
 * Cubre:
 *  - PAYE (Pay As You Earn) para empleados formales
 *  - WHT (Withholding Tax) para contratistas independientes
 *  - ACC Earners' Levy (incluida en PAYE)
 *  - Tasas 2024-2025 (IRD)
 *
 * Nota: Esta es una calculadora de referencia.
 *       Para declaraciones oficiales, usar myIR / consult an accountant.
 */

const TAX_NZ = (() => {

  /* ── Tasas PAYE 2024-25 (empleados) ─────────────────────────────
     Fuente: IRD New Zealand — ird.govt.nz
     Incluye ACC Earners' Levy ($1.60 per $100 of liable earnings)
  ──────────────────────────────────────────────────────────────── */
  const PAYE_BRACKETS = [
    { upTo: 14000,   rate: 0.105  },   // 10.5%
    { upTo: 48000,   rate: 0.175  },   // 17.5%
    { upTo: 70000,   rate: 0.30   },   // 30%
    { upTo: 180000,  rate: 0.33   },   // 33%
    { upTo: Infinity,rate: 0.39   },   // 39%
  ];

  // ACC Earners' Levy 2024-25: $1.60 per $100 = 1.60%
  // Capped at $139,384 liable earnings
  const ACC_RATE         = 0.0160;
  const ACC_MAX_EARNINGS = 139384;

  /* ── Tasas WHT (contratistas) ────────────────────────────────────
     Tasas estándar según IRD para schedular payments
     El contratista elige su tasa al llenar el IR330C
  ──────────────────────────────────────────────────────────────── */
  const WHT_RATES = [
    { label: '10%  — Ingreso bajo (hasta ~$14k anuales)',  rate: 0.10  },
    { label: '15%  — Ingreso bajo/medio',                  rate: 0.15  },
    { label: '20%  — Tasa estándar más común',             rate: 0.20  },
    { label: '25%  — Ingreso medio/alto',                  rate: 0.25  },
    { label: '33%  — Tasa máxima',                         rate: 0.33  },
    { label: '0%   — Exento (con certificado IRD)',         rate: 0.00  },
  ];

  /* ── Helpers ─────────────────────────────────────────────────── */

  /**
   * Calcula PAYE anual para un ingreso dado
   * @param {number} annualGross - ingreso anual bruto en NZD
   * @returns {{ tax, acc, total, effective }}
   */
  function calcPAYEAnnual(annualGross) {
    let tax = 0;
    let prev = 0;
    for (const bracket of PAYE_BRACKETS) {
      const taxable = Math.min(annualGross, bracket.upTo) - prev;
      if (taxable <= 0) break;
      tax += taxable * bracket.rate;
      prev = bracket.upTo;
    }
    const accLiable = Math.min(annualGross, ACC_MAX_EARNINGS);
    const acc = accLiable * ACC_RATE;
    const total = tax + acc;
    const effective = annualGross > 0 ? (total / annualGross) * 100 : 0;
    return { tax: round2(tax), acc: round2(acc), total: round2(total), effective: round2(effective) };
  }

  /**
   * Calcula PAYE a partir de un pago puntual (e.g. semana, quincena)
   * Anualiza el pago → calcula impuesto → divide al período
   * @param {number} grossAmount - monto bruto del período
   * @param {string} period - 'weekly'|'fortnightly'|'monthly'|'custom'
   * @param {number} [customHoursPerYear] - solo si period='custom'
   */
  function calcPAYEForPayment(grossAmount, period = 'weekly') {
    const multipliers = { weekly: 52, fortnightly: 26, monthly: 12, custom: 1 };
    const mult = multipliers[period] || 52;
    const annualGross = grossAmount * mult;
    const annual = calcPAYEAnnual(annualGross);
    const periodTax   = round2(annual.tax   / mult);
    const periodAcc   = round2(annual.acc   / mult);
    const periodTotal = round2(annual.total / mult);
    const netAmount   = round2(grossAmount - periodTotal);
    return {
      gross: grossAmount,
      tax: periodTax,
      acc: periodAcc,
      totalWithheld: periodTotal,
      net: netAmount,
      annualEquivalent: round2(annualGross),
      effectiveRate: annual.effective,
      period,
    };
  }

  /**
   * Calcula WHT para un pago a contratista
   * @param {number} grossAmount
   * @param {number} whtRate - ej: 0.20 para 20%
   */
  function calcWHT(grossAmount, whtRate) {
    const withheld = round2(grossAmount * whtRate);
    const net      = round2(grossAmount - withheld);
    return {
      gross: grossAmount,
      rate: whtRate,
      withheld,
      net,
    };
  }

  /**
   * Calcula impuesto para un pintor basado en:
   * - Sus horas trabajadas en un período
   * - Su tarifa por hora
   * - Su tipo (employee / contractor)
   * - Su tasa WHT (si es contratista)
   */
  function calcForPainter(painter, hours, period = 'weekly') {
    const gross = round2(hours * (painter.hourlyRate || 0));
    if (gross <= 0) return null;

    if (painter.taxType === 'contractor') {
      const whtRate = painter.whtRate || 0.20;
      return { type: 'contractor', ...calcWHT(gross, whtRate) };
    } else {
      // employee (default)
      return { type: 'employee', ...calcPAYEForPayment(gross, period) };
    }
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function fmtNZD(n) { return '$' + Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  return {
    calcPAYEAnnual,
    calcPAYEForPayment,
    calcWHT,
    calcForPainter,
    WHT_RATES,
    PAYE_BRACKETS,
    fmtNZD,
  };
})();
