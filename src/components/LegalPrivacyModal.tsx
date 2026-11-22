import React, { useState } from 'react';
import {
  X,
  Shield,
  MessageCircle,
  Building2,
  Scale,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export type LegalTab = 'privacy' | 'cgv' | 'agency';

interface LegalPrivacyModalProps {
  isOpen: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}

export const LegalPrivacyModal: React.FC<LegalPrivacyModalProps> = ({
  isOpen,
  initialTab = 'privacy',
  onClose,
}) => {
  const { user, theme } = useApp();
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const whatsappUrl =
    'https://wa.me/33684242949?text=' +
    encodeURIComponent(
      "Bonjour Digital Agency 👋 Je vous contacte depuis l'application ÉVASION."
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className={`relative w-full max-w-xl rounded-3xl border p-5 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar flex flex-col items-center text-center ${
          theme === 'dark' ? 'bg-zinc-900 border-zinc-700/80 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
        }`}
      >
        {/* Modal Header & Close */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-zinc-800/60 mb-5">
          <div className="flex items-center gap-2.5 mx-auto">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <Shield className="w-5 h-5" />
            </span>
            <div className="text-left">
              <h2 className="text-sm sm:text-base font-black tracking-tight">
                Centre Légal & Conformité
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                <span className="text-[#ef4444] animate-neon-flicker inline-block font-bold">É</span>VASION · Créé par Digital Agency
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Centered Navigation Tabs */}
        <div className="w-full grid grid-cols-3 gap-2 mb-6 p-1.5 rounded-2xl bg-zinc-950/80 border border-zinc-800">
          {[
            { id: 'privacy' as LegalTab, label: 'Confidentialité', icon: Shield },
            { id: 'cgv' as LegalTab, label: 'CGV / CGU', icon: Scale },
            { id: 'agency' as LegalTab, label: 'Digital Agency', icon: Building2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  active
                    ? 'bg-amber-500 text-zinc-950 shadow-md scale-[1.02]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: POLITIQUE DE CONFIDENTIALITÉ (RGPD) */}
        {activeTab === 'privacy' && (
          <div className="w-full space-y-4 text-xs sm:text-sm leading-relaxed text-left animate-fade-in">
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-3 text-zinc-300 shadow-inner">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold mb-1">
                <Shield className="w-4 h-4" />
                <h3 className="text-sm font-black uppercase tracking-wider text-center">
                  Politique de Confidentialité & Anonymat (RGPD)
                </h3>
              </div>
              <p className="text-center text-zinc-300">
                L'application <strong><span className="text-[#ef4444] animate-neon-flicker inline-block">É</span>VASION</strong>, éditée par <strong>Digital Agency</strong>, applique une stricte politique de minimisation des données (<em>Privacy by Design</em>) conformément au RGPD (UE 2016/679).
              </p>

              <div className="space-y-2 pt-2 border-t border-zinc-800/60 text-zinc-400 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <div>
                    <strong className="text-zinc-200">Pseudonymisation intégrale :</strong> Chaque utilisateur est identifié uniquement par son matricule anonyme (<code className="text-amber-400">{user.matricule}</code>) et son ID technique. Aucun nom réel ou adresse n'est requis.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <div>
                    <strong className="text-zinc-200">Zéro revente publicitaire :</strong> Vos aveux, notes vocales et sessions de détox ne sont jamais partagés ni monétisés auprès de tiers.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <div>
                    <strong className="text-zinc-200">Sécurité des paiements :</strong> Les règlements transitent par chiffrement SSL/TLS sécurisé via l'infrastructure officielle PayPal et cartes bancaires.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CGV / CGU & MENTIONS LÉGALES */}
        {activeTab === 'cgv' && (
          <div className="w-full space-y-4 text-xs sm:text-sm leading-relaxed text-left animate-fade-in">
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-3 text-zinc-300 shadow-inner">
              <div className="flex items-center justify-center gap-2 text-amber-400 font-bold mb-1">
                <Scale className="w-4 h-4" />
                <h3 className="text-sm font-black uppercase tracking-wider text-center">
                  CGV / CGU & Mentions Légales
                </h3>
              </div>
              <p className="text-center text-zinc-300">
                Conditions générales d'utilisation et de vente de la plateforme d'entraide numérique <strong><span className="text-[#ef4444] animate-neon-flicker inline-block">É</span>VASION</strong>.
              </p>

              <div className="space-y-2.5 pt-2 border-t border-zinc-800/60 text-zinc-400 text-xs">
                <div>
                  <strong className="text-zinc-200">1. Objet :</strong> Réseau social d'entraide et de libération d'addictions aux écrans basé sur l'échange de clés et de cadenas de solidarité.
                </div>
                <div>
                  <strong className="text-zinc-200">2. Micro-transactions (Boutique) :</strong> Passe-Partout (0,99 €), Packs Néon (0,50 €) et Abonnements VIP (1,99 €/mois). Fourniture de contenu numérique immédiate conformément à l'art. L221-28 du Code de la consommation.
                </div>
                <div>
                  <strong className="text-zinc-200">3. Modération :</strong> Équipe de modération active et relève de minuit automatique pour garantir un espace bienveillant et conforme aux lois en vigueur.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CRÉÉ PAR DIGITAL AGENCY & CONTACT WHATSAPP */}
        {activeTab === 'agency' && (
          <div className="w-full space-y-4 text-xs sm:text-sm leading-relaxed text-center animate-fade-in">
            <div className="p-5 rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/40 border border-emerald-500/40 space-y-4 shadow-xl">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-2xl shadow-inner">
                ⚡
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                  Conception · Développement · Édition
                </span>
                <h3 className="text-lg font-black text-white">
                  Créé par Digital Agency
                </h3>
              </div>

              <p className="text-xs text-zinc-300 max-w-md mx-auto leading-relaxed">
                Application pensée, conçue et développée par <strong>Digital Agency</strong> — Studio d'ingénierie numérique et de solutions web et mobiles à forte viralité.
              </p>

              <div className="pt-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(37,211,102,0.4)] transition-all active:scale-95"
                >
                  <MessageCircle className="w-4 h-4 fill-zinc-950" />
                  <span>Contacter Digital Agency sur WhatsApp</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Persistent Modal Footer */}
        <div className="w-full mt-6 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
          <span>© {new Date().getFullYear()} <span className="text-[#ef4444] animate-neon-flicker inline-block font-bold">É</span>VASION · Digital Agency</span>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-[#25D366] font-bold flex items-center gap-1.5 transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Contact WhatsApp Officiel</span>
          </a>
        </div>
      </div>
    </div>
  );
};
