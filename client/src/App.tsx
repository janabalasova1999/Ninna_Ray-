import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/react";
import Landing from "@/pages/Landing";
import Chat from "@/pages/Chat";
import AgentDashboard from "@/pages/AgentDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/chat" component={Chat} />
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/manager" component={ManagerDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <Analytics />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
