import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Lock, LogOut, Zap, Users, TrendingUp, Radio, BarChart3, Activity, Target } from "lucide-react";
import ninnaImg from "@assets/IMG_4700_1768775323977.jpeg";

const OWNER_PASSWORD = "ninna2024";

interface MasterStats {
  totalUsers: number;
  activeNow: number;
  todayRevenue: number;
  totalRevenue: number;
  totalMessages: number;
  avgEngagement: number;
  subscriptions: number;
  topContent: { name: string; purchases: number }[];
}

export default function OwnerControl() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [stats, setStats] = useState<MasterStats>({
    totalUsers: 127,
    activeNow: 23,
    todayRevenue: 45230,
    totalRevenue: 3693700,
    totalMessages: 8456,
    avgEngagement: 89,
    subscriptions: 34,
    topContent: [
      { name: "Photo #93", purchases: 45 },
      { name: "Video #103", purchases: 38 },
      { name: "Photo #62", purchases: 31 },
      { name: "Video #94", purchases: 28 },
    ],
  });
  const [commandInput, setCommandInput] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [recentActions, setRecentActions] = useState([
    { user: "Jana", action: "Koupila foto #93", time: "před 2 min", value: "375 Kč" },
    { user: "David", action: "Odemkl video #103", time: "před 5 min", value: "599 Kč" },
    { user: "Janča", action: "Nastavil si wardrobe", time: "před 8 min", value: "nový" },
    { user: "Petr", action: "Poslal 12 zpráv", time: "před 12 min", value: "+12" },
    { user: "Kuba", action: "Aktivní 2 hodiny", time: "před 15 min", value: "online" },
  ]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === OWNER_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Chybné heslo!");
      setPassword("");
    }
  };

  const sendCommand = (cmd: string) => {
    setLastCommand(cmd);
    setCommandInput("");
    setTimeout(() => setLastCommand(""), 3000);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center p-6">
        <Card className="bg-gray-800/50 border-pink-500/30 p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Lock className="w-12 h-12 mx-auto mb-4 text-pink-500" />
            <h1 className="text-3xl font-bold text-white mb-2">Master Control</h1>
            <p className="text-gray-400">Pouze pro majitele</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                data-testid="input-password"
              />
              {authError && (
                <p className="text-red-400 text-sm mt-2">{authError}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
              data-testid="button-login"
            >
              Přístup k Hlavní Ninně
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">🎛️ Master Control Panel</h1>
            <p className="text-gray-400">Ninna Ray - Agentura AI (Real-Time)</p>
          </div>
          <Button
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
            onClick={() => setIsAuthenticated(false)}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Odhlásit se
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-500/20 to-blue-900/20 border-blue-500/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-300 text-sm font-bold">UŽIVATELÉ</p>
                <p className="text-3xl font-black text-white">{stats.totalUsers}</p>
                <p className="text-xs text-blue-400">{stats.activeNow} online</p>
              </div>
              <Users className="w-12 h-12 text-blue-400 opacity-30" />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/20 to-green-900/20 border-green-500/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-300 text-sm font-bold">TRŽBY DNES</p>
                <p className="text-3xl font-black text-white">{(stats.todayRevenue / 1000).toFixed(0)}K</p>
                <p className="text-xs text-green-400">Kč</p>
              </div>
              <TrendingUp className="w-12 h-12 text-green-400 opacity-30" />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/20 to-purple-900/20 border-purple-500/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-300 text-sm font-bold">ZPRÁVY</p>
                <p className="text-3xl font-black text-white">{stats.totalMessages}</p>
                <p className="text-xs text-purple-400">dnes</p>
              </div>
              <Activity className="w-12 h-12 text-purple-400 opacity-30" />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-pink-500/20 to-pink-900/20 border-pink-500/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-pink-300 text-sm font-bold">ENGAGEMENT</p>
                <p className="text-3xl font-black text-white">{stats.avgEngagement}%</p>
                <p className="text-xs text-pink-400">průměrně</p>
              </div>
              <Target className="w-12 h-12 text-pink-400 opacity-30" />
            </div>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          {/* Live Ninna - Center */}
          <div className="xl:col-span-2 space-y-8">
            {/* Master Avatar */}
            <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden">
              <div className="relative h-[500px] flex items-center justify-center bg-gradient-to-t from-purple-900/40 to-transparent">
                {/* Live Indicator */}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-full px-4 py-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-red-300 uppercase">🔴 LIVE MASTER</span>
                </div>

                {/* Stats Overlay */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <div className="bg-green-500/20 border border-green-500/50 rounded-full px-3 py-1 text-xs">
                    <span className="text-green-300 font-bold">{stats.activeNow} uživatelů</span>
                  </div>
                  <div className="bg-blue-500/20 border border-blue-500/50 rounded-full px-3 py-1 text-xs">
                    <span className="text-blue-300 font-bold">{stats.subscriptions} předplatitel</span>
                  </div>
                </div>

                {/* Avatar */}
                <img
                  src={ninnaImg}
                  alt="Master Ninna"
                  className="w-full h-full object-cover"
                />

                {/* Status Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />

                {/* Info Badge */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center">
                  <h2 className="text-3xl font-black text-white drop-shadow-lg">
                    Ninna <span className="text-pink-400">Master</span>
                  </h2>
                  <div className="text-sm text-gray-200 mt-2">
                    {stats.subscriptions} aktivních předplatitelů
                  </div>
                </div>

                {/* Last Command */}
                {lastCommand && (
                  <div className="absolute top-28 left-1/2 transform -translate-x-1/2 bg-white text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-bounce">
                    ✓ {lastCommand}
                  </div>
                )}
              </div>
            </Card>

            {/* Top Content Performance */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                Top Prodávaný Obsah
              </h3>
              <div className="space-y-3">
                {stats.topContent.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-700/30 rounded">
                    <span className="text-white font-medium">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-600 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-pink-500 to-purple-600"
                          style={{ width: `${(item.purchases / 50) * 100}%` }}
                        />
                      </div>
                      <span className="text-pink-400 font-bold text-sm">{item.purchases}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Control Panel - Right */}
          <div className="space-y-4">
            {/* Quick Stats */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4">Financování</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">Celkem</span>
                    <span className="font-bold text-green-400">{(stats.totalRevenue / 1000000).toFixed(1)}M Kč</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">Dnes</span>
                    <span className="font-bold text-pink-400">{(stats.todayRevenue / 1000).toFixed(0)}K Kč</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-600">
                  <div className="text-xs text-gray-400">Průměrná transakce</div>
                  <div className="font-bold text-white">{Math.round(stats.totalRevenue / stats.totalMessages)} Kč</div>
                </div>
              </div>
            </Card>

            {/* Commands */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Radio className="w-5 h-5 text-purple-400" />
                Příkazy
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => sendCommand("Vyvolej report")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-report"
                >
                  📊 Vyvolej report
                </button>
                <button
                  onClick={() => sendCommand("Zobraz všechny Ninny")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-all-twins"
                >
                  👥 Všechny Ninny
                </button>
                <button
                  onClick={() => sendCommand("Analytics refresh")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-refresh"
                >
                  🔄 Refresh data
                </button>
                <button
                  onClick={() => sendCommand("Broadcast zpráva")}
                  className="w-full p-2 text-left bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-white transition"
                  data-testid="cmd-broadcast"
                >
                  📢 Broadcast
                </button>
              </div>
            </Card>

            {/* Custom Command */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-4">
              <label className="text-xs font-bold text-gray-400 uppercase block mb-2">
                Custom Příkaz
              </label>
              <div className="flex gap-2">
                <Input
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Příkaz..."
                  className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                  data-testid="input-command"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && commandInput) {
                      sendCommand(commandInput);
                    }
                  }}
                />
                <Button
                  onClick={() => commandInput && sendCommand(commandInput)}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 px-4"
                  data-testid="button-send-cmd"
                >
                  ➤
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* Real-Time Activity Feed */}
        <Card className="bg-gray-800/40 border-purple-500/30 p-6">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-6 h-6 text-pink-400" />
            Live Aktivita Zákazníků
          </h2>
          <div className="space-y-3">
            {recentActions.map((action, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-gray-700/20 rounded border border-gray-700/50 hover:bg-gray-700/30 transition">
                <div className="flex-1">
                  <div className="font-bold text-white">{action.user}</div>
                  <div className="text-sm text-gray-300">{action.action}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-pink-400">{action.value}</div>
                  <div className="text-xs text-gray-500">{action.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
