"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 邮箱注册
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/signin`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage("注册成功，请前往邮箱验证后登录。");
    }
  }

  // Google 授权注册
  async function handleGoogleSignUp() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/signin`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a1622", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#151f2e", borderRadius: 16, padding: 36, minWidth: 340, boxShadow: "0 4px 32px #0002" }}>
        <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>注册新账号</h2>
        <p style={{ color: "#7dd3fc", textAlign: "center", marginBottom: 24 }}>使用邮箱或 Google 账号注册</p>
        <form onSubmit={handleSignUp}>
          <label style={{ color: "#b6c2d6", fontSize: 13 }}>邮箱</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 10, margin: "8px 0 16px 0", borderRadius: 8, border: "1px solid #23304a", background: "#101926", color: "#fff" }}
            placeholder="请输入邮箱"
          />
          <label style={{ color: "#b6c2d6", fontSize: 13 }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: 10, margin: "8px 0 24px 0", borderRadius: 8, border: "1px solid #23304a", background: "#101926", color: "#fff" }}
            placeholder="设置密码（至少6位）"
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: 12, background: "#38bdf8", color: "#0a1622", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 16, marginBottom: 12, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "注册中..." : "注册"}
          </button>
        </form>
        <button
          onClick={handleGoogleSignUp}
          disabled={loading}
          style={{ width: "100%", padding: 12, background: "#fff", color: "#0a1622", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 16, marginBottom: 12, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <img src="/google.svg" alt="Google" style={{ width: 20, height: 20 }} />
          使用 Google 注册
        </button>
        {error && <div style={{ color: "#f87171", marginBottom: 8, textAlign: "center" }}>{error}</div>}
        {message && <div style={{ color: "#22d3ee", marginBottom: 8, textAlign: "center" }}>{message}</div>}
        <div style={{ textAlign: "center", marginTop: 16, width: '100%' }}>
          <a href="/signin" style={{ color: "#38bdf8", textDecoration: "underline", display: 'inline-block', width: '100%', textAlign: 'center', fontWeight: 500 }}>
            返回登录页面
          </a>
        </div>
      </div>
    </div>
  );
}
