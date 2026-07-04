import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot } from "lucide-react";
import { askAIChat } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };

interface AIChatProps {
  productName?: string;
  productCategory?: string;
  openOnMount?: boolean;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

export function AIChat({ productName, productCategory, openOnMount }: AIChatProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(!!openOnMount);
  const [waNumber, setWaNumber] = useState("");
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm Aavi, your shopping assistant. I can help you find products, check sizing, or answer questions about delivery and returns." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ask = useServerFn(askAIChat);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle()
      .then(({ data }) => {
        const raw = data?.value ?? "";
        if (raw) setWaNumber(raw.replace(/\D/g, ""));
      });
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [chatOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await ask({
        data: {
          message: text,
          productName,
          productCategory: productCategory ?? undefined,
          conversationHistory: newMessages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I'm having trouble. Please WhatsApp us for help!" }]);
    } finally {
      setLoading(false);
    }
  };

  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent("Hi! I have a question about The Aavira.")}`
    : null;

  const openChat = () => { setMenuOpen(false); setChatOpen(true); };
  const toggleMenu = () => {
    if (chatOpen) { setChatOpen(false); return; }
    setMenuOpen((v) => !v);
  };

  return (
    <div className={cn("fixed bottom-6 right-5 z-50 flex flex-col items-end gap-3 transition-all duration-500", visible ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0")}>

      {/* AI Chat window */}
      {chatOpen && (
        <div className="w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border/60 bg-background shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "min(420px, calc(100dvh - 10rem))" }}>
          <div className="flex items-center gap-2.5 px-4 py-3 bg-accent text-accent-foreground shrink-0">
            <div className="size-8 rounded-full bg-accent-foreground/20 grid place-items-center">
              <Bot className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Aavi</p>
              <p className="text-[10px] opacity-75 mt-0.5">AI Shopping Assistant</p>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat" className="ml-auto opacity-70 hover:opacity-100 transition-opacity">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scroll-smooth">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user" ? "bg-accent text-accent-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                )}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 pb-3 pt-2 border-t border-border/40 shrink-0">
            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask anything…"
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
                maxLength={500}
              />
              <button type="button" onClick={send} disabled={!input.trim() || loading} aria-label="Send"
                className="size-6 grid place-items-center text-accent disabled:opacity-40 transition-opacity">
                <Send className="size-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">Powered by AI · Not always perfect</p>
          </div>
        </div>
      )}

      {/* Expanded menu options */}
      {menuOpen && !chatOpen && (
        <div className="flex flex-col items-end gap-2">
          {/* AI Chat option */}
          <button type="button" onClick={openChat}
            className="flex items-center gap-2.5 bg-background border border-border/60 text-foreground rounded-full pl-3.5 pr-4 py-2.5 shadow-lg text-sm font-medium hover:bg-muted/60 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
            <span className="size-7 rounded-full bg-accent text-accent-foreground grid place-items-center shrink-0">
              <Bot className="size-3.5" />
            </span>
            Chat with Aavi (AI)
          </button>

          {/* WhatsApp option */}
          {waHref && (
            <a href={waHref} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 bg-[#25D366] text-white rounded-full pl-3.5 pr-4 py-2.5 shadow-lg text-sm font-medium hover:shadow-[0_4px_20px_rgba(37,211,102,0.5)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
              <WhatsAppIcon />
              Chat on WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Main toggle button */}
      <button
        type="button"
        onClick={toggleMenu}
        aria-label={chatOpen || menuOpen ? "Close" : "Get help"}
        className={cn(
          "size-13 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95",
          "bg-accent text-accent-foreground",
          (chatOpen || menuOpen) && "rotate-45"
        )}
      >
        {chatOpen || menuOpen ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>
    </div>
  );
}
