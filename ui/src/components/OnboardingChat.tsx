import { useState, useEffect, useRef } from "react";
import { Loader2, Sparkles, Send } from "lucide-react";
import { cn } from "../lib/utils.js";
import { onboardingApi, type OnboardingSessionResponse } from "../api/onboarding.js";

interface OnboardingChatProps {
  onComplete: (companyId: string, companyPrefix: string) => void;
}

export function OnboardingChat({ onComplete }: OnboardingChatProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [recommendation, setRecommendation] = useState<OnboardingSessionResponse["recommendationData"] | null>(null);
  const [coordinationMode, setCoordinationMode] = useState<"auto" | "sequential" | "structured">("auto");
  const [companyName, setCompanyName] = useState("");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Start session on mount
  useEffect(() => {
    async function startSession() {
      try {
        const { sessionId: newSessionId } = await onboardingApi.start();
        setSessionId(newSessionId);

        // Add initial greeting
        setMessages([{
          role: "assistant",
          content: "Welcome to Autogeny! I'm here to help you build your perfect AI team. Tell me about your business — what industry are you in, and what are you looking to automate?"
        }]);
      } catch (err) {
        setError("Failed to start onboarding session");
      }
    }
    startSession();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pre-fill company name when recommendation is received
  useEffect(() => {
    if (recommendation?.companyName) {
      setCompanyName(recommendation.companyName);
    }
  }, [recommendation]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !sessionId || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);
    setError(null);

    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const response = await onboardingApi.sendMessage(sessionId, userMessage);

      // Add assistant response
      setMessages((prev) => [...prev, { role: "assistant", content: response.response }]);

      if (response.isComplete) {
        setIsComplete(true);
        // Fetch full session to get recommendation
        const session = await onboardingApi.getSession(sessionId);
        setRecommendation(session.recommendationData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProvision = async () => {
    if (!sessionId || isProvisioning) return;

    setIsProvisioning(true);
    setError(null);

    try {
      const result = await onboardingApi.provision(
        sessionId,
        companyName.trim() || undefined,
        coordinationMode,
      );
      onComplete(result.companyId, result.companyPrefix);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to provision team");
      setIsProvisioning(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[600px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "rounded-lg p-3 max-w-[80%]",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
            </div>
          </div>
        ))}

        {/* Recommendation Card */}
        {isComplete && recommendation && (
          <div className="border border-border rounded-lg p-4 bg-card">
            <h3 className="font-semibold mb-2">{recommendation.templateKey}</h3>

            {/* Agent List */}
            <div className="space-y-1 mb-4">
              {recommendation.agents.map((agent, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{agent.name}</span>
                  <span className="text-muted-foreground"> ({agent.adapterType})</span>
                  <span className="text-muted-foreground"> — {agent.role}</span>
                </div>
              ))}
            </div>

            {/* Coordination Mode Selector - PROMINENT */}
            <div className="border border-border rounded-lg p-4 bg-muted/30 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h4 className="font-medium text-sm">Team Coordination</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                How should your agents work together on tasks?
              </p>
              <div className="space-y-2">
                {[
                  {
                    value: "auto",
                    label: "Auto (Recommended)",
                    desc: "Platform picks the best mode based on your agents' capabilities. Strong models self-organize; others get managed assignments."
                  },
                  {
                    value: "sequential",
                    label: "Self-Organizing",
                    desc: "Agents process tasks sequentially, choosing their own roles. 14% better quality than fixed hierarchies (research-backed). Best with capable models (Claude Sonnet 4.6+, GPT-5, DeepSeek v3)."
                  },
                  {
                    value: "structured",
                    label: "Managed Team",
                    desc: "Fixed roles and assignments. Tasks assigned to specific agents. Better for smaller teams or less capable models."
                  }
                ].map((mode) => (
                  <label
                    key={mode.value}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                      coordinationMode === mode.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="coordination"
                      value={mode.value}
                      checked={coordinationMode === mode.value}
                      onChange={() => setCoordinationMode(mode.value as typeof coordinationMode)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-sm">{mode.label}</div>
                      <div className="text-xs text-muted-foreground">{mode.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Company Name */}
            <div className="mb-4">
              <label className="text-sm font-medium block mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                placeholder="My Company"
              />
            </div>

            {/* Provision Button */}
            <button
              onClick={handleProvision}
              disabled={isProvisioning || !companyName.trim()}
              className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProvisioning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                "Set up my team"
              )}
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg p-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      {!isComplete && (
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading || !sessionId}
              placeholder="Type your message..."
              className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !sessionId || !inputValue.trim()}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
