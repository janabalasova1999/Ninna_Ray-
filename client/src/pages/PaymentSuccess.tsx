import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Check, MessageCircle, AlertCircle, Loader } from "lucide-react";

export default function PaymentSuccess() {
  const [location, setLocation] = useLocation();
  const [sessionStatus, setSessionStatus] = useState<"loading" | "success" | "pending" | "error">("loading");

  // Extract query params from location
  const urlParams = new URLSearchParams(location.split("?")[1]);
  const sessionId = urlParams.get("session_id");
  const type = urlParams.get("type");

  useEffect(() => {
    if (!sessionId) {
      setSessionStatus("error");
      return;
    }

    fetch(`/api/stripe/session-info/${sessionId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.success) {
          setSessionStatus("success");
        } else {
          setSessionStatus("pending");
        }
      })
      .catch(err => {
        console.error("Session check error:", err);
        setSessionStatus("error");
      });
  }, [sessionId]);

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-pink-500" />
          <p className="text-gray-400">Ověřuji tvou platbu...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Chyba v ověření</h1>
          <p className="text-gray-400 mb-8">
            Nepodařilo se ověřit tvou platbu. Kontaktuj nás prosím.
          </p>
          <Button
            onClick={() => setLocation("/chat")}
            className="bg-gradient-to-r from-pink-500 to-purple-600"
            data-testid="button-back-to-chat-error"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Zpět do chatu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center text-white">
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold mb-3" data-testid="text-success-title">
          {type === "subscription" ? "Předplatné aktivováno!" : "Platba proběhla!"}
        </h1>
        <p className="text-gray-400 mb-8" data-testid="text-success-message">
          {type === "subscription" ? "Díky! Tvé předplatné je aktivní. Těšíme se na tebe! 💋" : "Díky moc! Obsah je odemknutý. Ninna se na tebe už těší... 🔥"}
        </p>
        <Button
          onClick={() => setLocation("/chat")}
          className="bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 text-white px-8"
          data-testid="button-back-to-chat"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Zpět do chatu
        </Button>
      </div>
    </div>
  );
}
