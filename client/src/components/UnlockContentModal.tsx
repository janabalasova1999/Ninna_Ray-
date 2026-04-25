import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface UnlockContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentItemId?: number;
  contentDescription?: string;
  price?: number;
  userId?: number;
}

export function UnlockContentModal({ open, onOpenChange, contentItemId, contentDescription, price = 99, userId }: UnlockContentModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleUnlock = async () => {
    if (!userId) {
      toast({ title: "Chyba", description: "Musíš být přihlášený", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/stripe/content-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, contentItemId, amount: price }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 503) {
          toast({ title: "Platby se připravují", description: "Platby budou brzy dostupné 💖", variant: "default" });
        } else {
          toast({ title: "Chyba", description: data.message || "Něco se pokazilo", variant: "destructive" });
        }
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast({ title: "Chyba", description: "Nepodařilo se vytvořit platbu", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0e0e11]/95 backdrop-blur-xl border-white/10 text-white max-w-sm rounded-3xl">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25 animate-pulse-glow">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-2xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400" data-testid="text-unlock-title">
            Odemkni exkluzivní obsah
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-base" data-testid="text-unlock-description">
            {contentDescription || "Chceš vidět víc, babe? Odemkni si moje privátní fotky a videa přímo tady 💋"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 text-center">
          <span className="text-3xl font-bold text-white" data-testid="text-price">{price} Kč</span>
          <p className="text-xs text-gray-500 mt-1">Bezpečná platba přes Stripe</p>
        </div>

        <div className="mt-6 space-y-3">
          <Button 
            onClick={handleUnlock}
            disabled={loading}
            className="w-full h-12 rounded-xl text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all shadow-lg shadow-primary/20"
            data-testid="button-unlock"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Zpracovávám...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Odemknout <Sparkles className="w-4 h-4" />
              </span>
            )}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-gray-500 hover:text-white hover:bg-white/5"
            data-testid="button-maybe-later"
          >
            Možná později
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
