"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DISCOUNTS = [
  { code: "DLUCKY10", value: 10 },
  { code: "DLUCKY20", value: 20 },
  { code: "DLUCKY30", value: 30 },
  { code: "DLUCKY50", value: 50 },
];

export default function DiscountWheelPage() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ code: string; value: number } | null>(null);

  function spinWheel() {
    setSpinning(true);
    setTimeout(() => {
      const idx = Math.floor(Math.random() * DISCOUNTS.length);
      setResult(DISCOUNTS[idx]);
      setSpinning(false);
    }, 1800);
  }

  function goToBuy() {
    if (result) {
      router.push(`/Buy?discount=${result.code}`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a1622", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#151f2e", borderRadius: 16, padding: 36, minWidth: 340, boxShadow: "0 4px 32px #0002", textAlign: "center" }}>
        <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>幸运转盘</h2>
        <p style={{ color: "#7dd3fc", marginBottom: 24 }}>抽取专属折扣码，购买更优惠！</p>
        <div style={{ margin: "32px 0" }}>
          <button
            onClick={spinWheel}
            disabled={spinning || result !== null}
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #38bdf8 60%, #7dd3fc 100%)",
              color: "#0a1622",
              fontSize: 28,
              fontWeight: 700,
              border: "none",
              boxShadow: "0 0 32px #38bdf888",
              cursor: spinning || result ? "not-allowed" : "pointer",
              transition: "all 0.3s",
              animation: spinning ? "spin 1.8s cubic-bezier(.68,-0.55,.27,1.55)" : "none",
            }}
          >
            {spinning ? "转动中..." : result ? "已中奖" : "点击抽奖"}
          </button>
        </div>
        {result && (
          <div style={{ margin: "24px 0", color: "#22d3ee", fontSize: 20, fontWeight: 600 }}>
            恭喜你获得 <span style={{ color: "#fbbf24" }}>{result.value} 元</span> 折扣码！<br />
            <span style={{ fontSize: 18, letterSpacing: 2, background: "#fff", color: "#0a1622", borderRadius: 6, padding: "4px 12px", margin: "8px 0", display: "inline-block" }}>{result.code}</span>
          </div>
        )}
        <button
          onClick={goToBuy}
          disabled={!result}
          style={{
            width: "100%",
            padding: 12,
            background: result ? "#38bdf8" : "#7dd3fc",
            color: "#0a1622",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            marginTop: 12,
            cursor: result ? "pointer" : "not-allowed",
          }}
        >
          去购买页面使用折扣码
        </button>
        <div style={{ marginTop: 24, color: "#b6c2d6", fontSize: 13 }}>
          折扣码仅限本次使用，有效期24小时。
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(1080deg); }
        }
      `}</style>
    </div>
  );
}
