import "./landing-v2.css";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import AboutSection from "@/components/landing-v2/AboutSection";
import AppCapabilitiesSection from "@/components/landing-v2/AppCapabilitiesSection";
import DeviceShowcaseSection from "@/components/landing-v2/DeviceShowcaseSection";
import EloAssistantSection from "@/components/landing-v2/EloAssistantSection";
import FaqSection from "@/components/landing-v2/FaqSection";
import HeroSection from "@/components/landing-v2/HeroSection";
import InstagramUpdatesSection from "@/components/landing-v2/InstagramUpdatesSection";
import NotebookToAppSection from "@/components/landing-v2/NotebookToAppSection";
import PricingSection from "@/components/landing-v2/PricingSection";
import Footer from "@/components/landing-v2/Footer";
import { capturarUtm, hostDoReferrer, track } from "@/lib/analytics";

export default function LandingPage() {
  const location = useLocation();

  // Visita do funil: só é enviada com consentimento de analytics.
  useEffect(() => {
    track("landing_viewed", { ...capturarUtm(), referrer_host: hostDoReferrer(), path: window.location.pathname });
  }, []);

  // Links externos (e a rota /planos) chegam com #planos, #faq etc.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(id))?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash]);

  return (
    <div className="landing-v2 min-h-screen overflow-x-clip bg-background">
      <main>
        <HeroSection />
        <AppCapabilitiesSection />
        <AboutSection />
        <NotebookToAppSection />
        <EloAssistantSection />
        <PricingSection />
        <DeviceShowcaseSection />
        <FaqSection />
        <InstagramUpdatesSection />
      </main>
      <Footer />
    </div>
  );
}
