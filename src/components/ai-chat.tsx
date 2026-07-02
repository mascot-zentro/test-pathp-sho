import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot } from "lucide-react";
import { askAIChat } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

interface AIChatProps {
  productName?: string;
  productCategory?: string;
  openOnMount?: boolean;
}

export function AIChat({ productName, productCategory, openOnMount }: AIChatProps) {
  const [open, setOpen] = useState(!!openOnMount);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm Aavi, your shopping assistant. I can help you find products, check sizing, or answer questions about delivery and returns." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ask = useServerFn(askAIChat);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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

  return (
    <>
      {/* Bubble */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-22 right-5 z-50 size-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          "bg-accent text-accent-foreground hover:scale-105 active:scale-95",
          open && "rotate-12"
        )}
        aria-label="Chat with Aavi"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-36 right-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border/60 bg-background shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "min(420px, calc(100dvh - 10rem))" }}>
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-accent text-accent-foreground shrink-0">
            <div className="size-8 rounded-full bg-accent-foreground/20 grid place-items-center">
              <Bot className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Aavi</p>
              <p className="text-[10px] opacity-75 mt-0.5">AI Shopping Assistant</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto opacity-70 hover:opacity-100 transition-opacity">
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scroll-smooth">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-accent text-accent-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
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

          {/* Input */}
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
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || loading}
                className="size-6 grid place-items-center text-accent disabled:opacity-40 transition-opacity"
              >
                <Send className="size-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">Powered by AI · Not always perfect</p>
          </div>
        </div>
      )}
    </>
  );
}
