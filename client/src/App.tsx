import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/react";
import Landing from "@/pages/Landing";
import Chat from "@/pages/Chat";
import Twin from "@/pages/Twin";
import UserPersonal from "@/pages/UserPersonal";
import OwnerControl from "@/pages/OwnerControl";
import AgentDashboard from "@/pages/AgentDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import Payment from "@/pages/Payment";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import AvatarCustomizer from "@/pages/AvatarCustomizer";
import EBot from "@/pages/EBot";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/chat" component={Chat} />
      <Route path="/personal" component={UserPersonal} />
      <Route path="/twin" component={Twin} />
      <Route path="/owner" component={OwnerControl} />
      <Route path="/bot" component={EBot} />
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/manager" component={ManagerDashboard} />
      <Route path="/payment" component={Payment} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      <Route path="/avatar" component={AvatarCustomizer} />
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
