import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Sparkles,
  UserCheck,
  CreditCard,
  Lock,
} from 'lucide-react';
import { useApp, isMasterPassUser } from '../context/AppContext';
import { CheckoutItemRequest, NeonColor, CellFrame, ConfessionPost, UserProfile } from '../types';
import {
  NEON_PALETTE,
  CELL_FRAME_OPTIONS,
  getNeonItem,
  getNeonAvatarRingClass,
  getCellFrameClasses,
} from '../utils/neonStyles';
import { AvatarDisplay } from './AvatarDisplay';

interface PayPalShopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_PACKS: CheckoutItemRequest[] = [
  {
    id: 'neon_pack_custom',
    name: 'Pack « Style Néon »',
    tagline: 'Change ta couleur néon + cadre de cellule sur tout ÉVASION (Mur, Cour & Profil).',
    priceLabel: '0,50 €',
    amount: 0.50,
    icon: '🎨',
    type: 'neon_pack',
    neonColor: 'cyan',
    cellFrame: 'neon',
  },
  {
    id: 'pack_keys_15',
    name: 'Trousseau Clandestin',
    tagline: '15 clés (+1 500 pts potentiels & +1 Passe-Partout à 10 clés) + 2 cadenas Haute Valeur.',
    priceLabel: '1,99 €',
    amount: 1.99,
    keys: 15,
    padlocks: 2,
    icon: '🗝️',
    type: 'keys_pack',
  },
  {
    id: 'pack_vip_50',
    name: 'Passe-Partout VIP + Cadenas',
    tagline: '50 clés (jusqu’à +5 000 pts & +5 Passe-Partout) + 5 cadenas Haute Valeur 🔒 + Cellule VIP.',
    priceLabel: '4,99 €',
    amount: 4.99,
    keys: 50,
    padlocks: 5,
    isVip: true,
    icon: '👑',
    type: 'keys_pack',
  },
  {
    id: 'pack_donation_1',
    name: 'Micro-Don de Soutien',
    tagline: 'Soutien solidaire au projet ÉVASION + 5 Clés 🔑 & +1 Cadenas 🔒.',
    priceLabel: '1,00 €',
    amount: 1.00,
    keys: 5,
    padlocks: 1,
    icon: '💝',
    type: 'keys_pack',
  },
  {
    id: 'pack_dev_support',
    name: 'Café des Développeurs',
    tagline: 'Soutien direct à ÉVASION + 10 clés (+1 000 pts & +1 Passe-Partout) & 2 cadenas Haute Valeur.',
    priceLabel: '2,50 €',
    amount: 2.50,
    keys: 10,
    padlocks: 2,
    icon: '☕',
    type: 'keys_pack',
  },
  {
    id: 'pack_donation_5',
    name: 'Don Libérateur VIP',
    tagline: 'Soutien aux serveurs ÉVASION + 30 Clés 🔑, +5 Cadenas 🔒 & Statut VIP.',
    priceLabel: '5,00 €',
    amount: 5.00,
    keys: 30,
    padlocks: 5,
    isVip: true,
    icon: '💖',
    type: 'keys_pack',
  },
  {
    id: 'pack_donation_10',
    name: 'Grand Donateur Mécène',
    tagline: 'Mécénat anti-algorithmes + 75 Clés 🔑, +10 Cadenas 🔒 & Badge Mécène 🌟.',
    priceLabel: '10,00 €',
    amount: 10.00,
    keys: 75,
    padlocks: 10,
    isVip: true,
    icon: '🌟',
    type: 'keys_pack',
  },
  {
    id: 'pack_storage_50',
    name: 'Extension Mémoire Univers (+50 Médias)',
    tagline: '+50 emplacements photos, vidéos, audios & fichiers sur ton profil + 2 Clés 🔑.',
    priceLabel: '1,99 €',
    amount: 1.99,
    storageSlots: 50,
    keys: 2,
    icon: '🧠',
    type: 'storage_pack',
  },
  {
    id: 'pack_storage_150',
    name: 'Extension Mémoire Univers (+150 Médias)',
    tagline: '+150 emplacements médias sans rien effacer + 5 Clés 🔑 & +2 Cadenas 🔒.',
    priceLabel: '3,99 €',
    amount: 3.99,
    storageSlots: 150,
    keys: 5,
    padlocks: 2,
    icon: '💾',
    type: 'storage_pack',
  },
  {
    id: 'pack_storage_unlimited',
    name: 'Mémoire Univers Illimitée ∞',
    tagline: 'Stockage média illimité à vie (photos, vidéos & fichiers) + 10 Clés 🔑 + 5 Cadenas 🔒 + VIP.',
    priceLabel: '7,99 €',
    amount: 7.99,
    isStorageUnlimited: true,
    keys: 10,
    padlocks: 5,
    isVip: true,
    icon: '♾️',
    type: 'storage_pack',
  },
];

const PAYPAL_CLIENT_ID =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PAYPAL_CLIENT_ID ||
  'BAAnPrAdD2PEa9t3gisksnKFdvFOj7zn6zJLIn8Nd9Fn0u-1jpjP6R5Arj9i2vBGUOmR34XVpYyzjAtGIg';

type PayPalTabMode = 'card_paypal' | 'account_paypal';

export const PayPalShopModal: React.FC<PayPalShopModalProps> = ({ isOpen, onClose }) => {
  const {
    checkoutItem,
    applyVerifiedServerPurchase,
    executeFreePassOrder,
    authFetch,
    syncServerSession,
    connectWithPseudo,
    loginAccount,
    user,
    theme,
  } = useApp();
  const isLight = theme === 'light';
  const isMasterPass = isMasterPassUser(user);
  const [isActivatingFreePass, setIsActivatingFreePass] = useState(false);

  const [selectedPack, setSelectedPack] = useState<CheckoutItemRequest>(DEFAULT_PACKS[2]);
  const [activeTab, setActiveTab] = useState<PayPalTabMode>('card_paypal');

  // Inline pseudo / code switcher inside checkout ("facilité avec pseudo ou autres")
  const [showInlinePseudoEdit, setShowInlinePseudoEdit] = useState(false);
  const [inlineIdentityInput, setInlineIdentityInput] = useState('');
  const [inlinePasswordInput, setInlinePasswordInput] = useState('');
  const [inlineIdentityBusy, setInlineIdentityBusy] = useState(false);
  const [inlineIdentityFeedback, setInlineIdentityFeedback] = useState<string | null>(null);

  const [chosenNeon, setChosenNeon] = useState<NeonColor>(user.neonColor || 'emerald');
  const [chosenFrame, setChosenFrame] = useState<CellFrame>(
    user.cellBorderFrame && user.cellBorderFrame !== 'none' ? user.cellBorderFrame : 'neon'
  );

  // PayPal SDK & Flow States
  const [activeClientId, setActiveClientId] = useState<string>(PAYPAL_CLIENT_ID);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState<boolean>(false);
  const [paypalMode, setPaypalMode] = useState<'live' | 'sandbox' | 'unconfigured'>('live');
  const [sdkLoaded, setSdkLoaded] = useState<boolean>(false);
  const [sdkBlocked, setSdkBlocked] = useState<boolean>(false);

  // CardFields & Buttons availability
  const [cardFieldsReady, setCardFieldsReady] = useState<boolean>(false);
  const [cardFieldsUnavailable, setCardFieldsUnavailable] = useState<boolean>(false);
  const [isSubmittingCardFields, setIsSubmittingCardFields] = useState<boolean>(false);
  const [cardHolderName, setCardHolderName] = useState<string>('');

  // Order & Confirmation states
  const [isCreatingPaypalOrder, setIsCreatingPaypalOrder] = useState<boolean>(false);
  const [isConfirmingPaypal, setIsConfirmingPaypal] = useState<boolean>(false);
  const [paypalRedirectUrl, setPaypalRedirectUrl] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [pendingDonationOrder, setPendingDonationOrder] = useState<{
    orderId: string;
    item?: CheckoutItemRequest;
    createdAt?: number;
  } | null>(null);
  const [manualOrderIdInput, setManualOrderIdInput] = useState('');
  const [showManualOrderIdForm, setShowManualOrderIdForm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem('evasion_pending_paypal_order');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.orderId === 'string') {
            setPendingDonationOrder(parsed);
          }
        } else {
          setPendingDonationOrder(null);
        }
      } catch {
        setPendingDonationOrder(null);
      }
    }
  }, [isOpen]);

  // DOM Refs for PayPal Official Components
  const paypalWalletContainerRef = useRef<HTMLDivElement>(null);
  const paypalCardButtonContainerRef = useRef<HTMLDivElement>(null);
  const cardNumberFieldRef = useRef<HTMLDivElement>(null);
  const cardExpiryFieldRef = useRef<HTMLDivElement>(null);
  const cardCvvFieldRef = useRef<HTMLDivElement>(null);
  const cardFieldsInstanceRef = useRef<any>(null);

  // Refs to avoid re-mounting PayPal Zoid iframes during checkout
  const pendingSessionRef = useRef<{ account: any; token: string } | null>(null);
  const fulfilledOrderIdsRef = useRef<Set<string>>(new Set());

  const isNeonPackSelected = selectedPack.type === 'neon_pack' || selectedPack.type === 'neon_style';

  const getEffectivePack = useCallback((): CheckoutItemRequest => {
    if (!isNeonPackSelected) return selectedPack;
    const neonInfo = getNeonItem(chosenNeon);
    return {
      ...selectedPack,
      neonColor: chosenNeon,
      name: `Style Néon ${neonInfo.shortLabel}`,
      cellFrame: chosenFrame,
    };
  }, [isNeonPackSelected, selectedPack, chosenNeon, chosenFrame]);

  const latestCheckoutRef = useRef<{
    effectivePack: CheckoutItemRequest;
    user: UserProfile;
  }>({
    effectivePack: getEffectivePack(),
    user,
  });

  useEffect(() => {
    latestCheckoutRef.current = {
      effectivePack: getEffectivePack(),
      user,
    };
  }, [getEffectivePack, user]);

  useEffect(() => {
    if (isOpen) {
      if (checkoutItem) {
        setSelectedPack(checkoutItem);
        setChosenNeon(checkoutItem.neonColor || user.neonColor || 'emerald');
        setChosenFrame(
          checkoutItem.cellFrame
            ? checkoutItem.cellFrame
            : user.cellBorderFrame && user.cellBorderFrame !== 'none'
            ? user.cellBorderFrame
            : 'neon'
        );
      } else {
        setSelectedPack(DEFAULT_PACKS[2]);
        setChosenNeon(user.neonColor || 'emerald');
        setChosenFrame(
          user.cellBorderFrame && user.cellBorderFrame !== 'none' ? user.cellBorderFrame : 'neon'
        );
      }
      setPaypalRedirectUrl(null);
      setPaypalOrderId(null);
      setPaypalError(null);
      setIsConfirmingPaypal(false);
      setIsSubmittingCardFields(false);
      setShowInlinePseudoEdit(false);
      setInlineIdentityFeedback(null);
      setInlineIdentityInput(
        user.alias && user.alias !== 'Spectre En Quête' && user.alias !== 'Anonyme'
          ? user.alias
          : ''
      );
    }
  }, [isOpen, checkoutItem]);

  // 1. Fetch authoritative PayPal clientId, clientToken & live/sandbox status from server
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void fetch('/api/paypal/config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            clientId?: string | null;
            clientToken?: string | null;
            mode?: 'live' | 'sandbox' | 'unconfigured';
          } | null
        ) => {
          if (!active) return;
          if (data?.clientId) setActiveClientId(data.clientId);
          if (data?.clientToken) setClientToken(data.clientToken);
          if (data?.mode) setPaypalMode(data.mode);
          setConfigLoaded(true);
        }
      )
      .catch(() => {
        if (active) setConfigLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  // 2. Load PayPal JS SDK with buttons, card-fields & funding-eligibility
  useEffect(() => {
    if (!isOpen || isMasterPass || !configLoaded) return;

    const paypalGlobal = (window as unknown as {
      paypal?: { Buttons?: unknown; CardFields?: unknown };
    }).paypal;

    if (paypalGlobal?.Buttons && paypalGlobal?.CardFields) {
      setSdkLoaded(true);
      setSdkBlocked(false);
      return;
    }

    const expectedSrc = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      activeClientId
    )}&currency=EUR&intent=capture&components=buttons,card-fields,funding-eligibility&enable-funding=card,paylater&locale=fr_FR`;

    const scriptId = 'paypal-sdk-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const handleLoad = () => {
      const pp = (window as unknown as { paypal?: { Buttons?: unknown } }).paypal;
      if (pp?.Buttons) {
        setSdkLoaded(true);
        setSdkBlocked(false);
      } else {
        setSdkBlocked(true);
      }
    };
    const handleError = () => {
      setSdkLoaded(false);
      setSdkBlocked(true);
    };

    if (script && script.src !== expectedSrc) {
      script.remove();
      script = null;
    }

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = expectedSrc;
      script.async = true;
      if (clientToken) {
        script.setAttribute('data-client-token', clientToken);
      }
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      document.body.appendChild(script);
    } else {
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
    }

    const fallbackTimer = window.setTimeout(() => {
      if (!(window as unknown as { paypal?: { Buttons?: unknown } }).paypal?.Buttons) {
        setSdkBlocked(true);
      }
    }, 6500);

    return () => {
      window.clearTimeout(fallbackTimer);
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
    };
  }, [isOpen, activeClientId, clientToken, configLoaded, isMasterPass]);

  // Helper: create a PayPal order on server without triggering React state re-renders mid-popup
  const createServerOrderForSdk = useCallback(
    async (landingPage: 'BILLING' | 'LOGIN' | 'NO_PREFERENCE'): Promise<string> => {
      setPaypalError(null);
      const { effectivePack, user: currentUser } = latestCheckoutRef.current;

      const res = await authFetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: effectivePack.id,
          targetPostId: effectivePack.postId || effectivePack.targetPostId,
          neonColor: effectivePack.neonColor,
          cellFrame: effectivePack.cellFrame,
          authorId: currentUser.id,
          matricule: currentUser.matricule,
          alias: currentUser.alias,
          avatar: currentUser.avatar,
          referralCode: currentUser.referralCode,
          landingPage,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        orderId?: string;
        approveUrl?: string | null;
        token?: string;
        account?: any;
        error?: string;
      };

      if (!res.ok || !data.success || !data.orderId) {
        const errMsg = data?.error || 'Impossible de créer la commande PayPal.';
        setPaypalError(errMsg);
        throw new Error(errMsg);
      }

      if (data.token) {
        try {
          localStorage.setItem('evasion_auth_token_v1', data.token);
        } catch {
          // ignore
        }
        if (data.account) {
          pendingSessionRef.current = { account: data.account, token: data.token };
        }
      }

      try {
        localStorage.setItem(
          'evasion_pending_paypal_order',
          JSON.stringify({
            orderId: data.orderId,
            item: effectivePack,
            referralCode: data.account?.profile?.referralCode || currentUser.referralCode,
            createdAt: Date.now(),
          })
        );
      } catch {
        // ignore
      }

      return data.orderId;
    },
    [authFetch]
  );

  // Helper: capture an approved PayPal order and unlock item
  const captureAndFulfillOrder = useCallback(
    async (
      orderId: string,
      methodLabel: string,
      options?: { silentPoll?: boolean }
    ): Promise<boolean> => {
      if (!orderId || fulfilledOrderIdsRef.current.has(orderId)) return false;

      const silentPoll = Boolean(options?.silentPoll);
      if (!silentPoll) {
        setIsConfirmingPaypal(true);
        setPaypalError(null);
      }

      try {
        const { effectivePack, user: currentUser } = latestCheckoutRef.current;
        const referralCode =
          pendingSessionRef.current?.account?.profile?.referralCode || currentUser.referralCode;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (pendingSessionRef.current?.token) {
          headers.Authorization = `Bearer ${pendingSessionRef.current.token}`;
        }

        const capRes = await authFetch('/api/paypal/capture-order', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            orderId,
            referralCode,
            silentPoll,
          }),
        });

        const capData = (await capRes.json()) as {
          success?: boolean;
          pending?: boolean;
          orderId?: string;
          profile?: UserProfile;
          post?: ConfessionPost;
          error?: string;
        };

        if (!capRes.ok || !capData.success) {
          if (!silentPoll) {
            setPaypalError(
              capData?.error ||
                "Paiement non encore validé sur PayPal. Finalise d'abord le règlement puis réessaie."
            );
          }
          return false;
        }

        fulfilledOrderIdsRef.current.add(orderId);
        try {
          localStorage.removeItem('evasion_pending_paypal_order');
        } catch {
          // ignore
        }

        if (pendingSessionRef.current) {
          syncServerSession(pendingSessionRef.current.account, pendingSessionRef.current.token);
          pendingSessionRef.current = null;
        }

        applyVerifiedServerPurchase({
          item: effectivePack,
          methodLabel,
          profile: capData.profile,
          post: capData.post,
          txId: capData.orderId || orderId,
        });
        onClose();
        return true;
      } catch {
        if (!silentPoll) {
          setPaypalError('Erreur réseau lors de la vérification du paiement PayPal.');
        }
        return false;
      } finally {
        if (!silentPoll) {
          setIsConfirmingPaypal(false);
        }
      }
    },
    [authFetch, applyVerifiedServerPurchase, onClose, syncServerSession]
  );

  // 3. Render Official PayPal Components ONCE when SDK is ready (never destroyed on pack/user state changes)
  useEffect(() => {
    if (!isOpen || !sdkLoaded || isMasterPass) return;

    const paypal = (window as unknown as { paypal?: any }).paypal;
    if (!paypal) return;

    const walletEl = paypalWalletContainerRef.current;
    const cardBtnEl = paypalCardButtonContainerRef.current;
    const numEl = cardNumberFieldRef.current;
    const expEl = cardExpiryFieldRef.current;
    const cvvEl = cardCvvFieldRef.current;

    if (walletEl) walletEl.innerHTML = '';
    if (cardBtnEl) cardBtnEl.innerHTML = '';
    if (numEl) numEl.innerHTML = '';
    if (expEl) expEl.innerHTML = '';
    if (cvvEl) cvvEl.innerHTML = '';

    setCardFieldsReady(false);
    setCardFieldsUnavailable(false);
    const cardFieldsFallbackTimer = window.setTimeout(() => {
      setCardFieldsUnavailable(true);
    }, 4500);

    // A) Official PayPal Wallet Button (Gold)
    if (paypal.Buttons && walletEl) {
      try {
        const walletBtn = paypal.Buttons({
          fundingSource: paypal.FUNDING?.PAYPAL || 'paypal',
          style: {
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
            height: 44,
          },
          createOrder: () => createServerOrderForSdk('LOGIN'),
          onApprove: async (data: { orderID?: string }) => {
            if (data?.orderID) {
              await captureAndFulfillOrder(data.orderID, 'PayPal');
            }
          },
          onError: () => {
            setPaypalError(
              'La fenêtre PayPal a été fermée ou interrompue. Tu peux réessayer ou utiliser le bouton PayPal.com ci-dessous.'
            );
          },
        });
        if (!walletBtn.isEligible || walletBtn.isEligible()) {
          walletBtn.render(walletEl).catch(() => {});
        }
      } catch {
        // fallback link remains available
      }
    }

    // B) Official PayPal Card Button ("Carte bancaire" via PayPal)
    if (paypal.Buttons && cardBtnEl) {
      try {
        const cardBtn = paypal.Buttons({
          fundingSource: paypal.FUNDING?.CARD || 'card',
          style: {
            color: 'black',
            shape: 'rect',
            height: 44,
          },
          createOrder: () => createServerOrderForSdk('BILLING'),
          onApprove: async (data: { orderID?: string }) => {
            if (data?.orderID) {
              await captureAndFulfillOrder(data.orderID, 'Carte Bancaire PayPal');
            }
          },
          onError: () => {
            setPaypalError(
              'Le module Carte PayPal a été interrompu. Utilise les champs Carte PayPal ci-dessous ou le lien direct Carte PayPal.com.'
            );
          },
        });
        if (!cardBtn.isEligible || cardBtn.isEligible()) {
          cardBtn.render(cardBtnEl).catch(() => {});
        }
      } catch {
        // CardFields and direct link remain available
      }
    }

    // C) Official PayPal Hosted CardFields (Direct Visa / Mastercard / Amex via PayPal)
    if (typeof paypal.CardFields === 'function' && numEl && expEl && cvvEl) {
      try {
        const cardFields = paypal.CardFields({
          style: {
            input: {
              'font-size': '14px',
              'font-family': 'monospace, sans-serif',
              color: '#18181b',
              padding: '10px 12px',
            },
            '.invalid': {
              color: '#dc2626',
            },
          },
          createOrder: () => createServerOrderForSdk('BILLING'),
          onApprove: async (data: { orderID?: string }) => {
            setIsSubmittingCardFields(false);
            if (data?.orderID) {
              await captureAndFulfillOrder(data.orderID, 'Carte Bancaire PayPal');
            }
          },
          onError: () => {
            setIsSubmittingCardFields(false);
            setPaypalError(
              'Paiement par carte refusé ou interrompu par la banque. Vérifie les informations de ta carte ou utilise le bouton Carte sur PayPal.com ci-dessous.'
            );
          },
        });

        if (cardFields.isEligible && cardFields.isEligible()) {
          cardFieldsInstanceRef.current = cardFields;
          Promise.all([
            cardFields.NumberField({ placeholder: 'Numéro de carte (Visa, Mastercard, CB...)' }).render(numEl),
            cardFields.ExpiryField({ placeholder: 'MM / AA' }).render(expEl),
            cardFields.CVVField({ placeholder: 'CVV (3 chiffres)' }).render(cvvEl),
          ])
            .then(() => {
              window.clearTimeout(cardFieldsFallbackTimer);
              setCardFieldsReady(true);
              setCardFieldsUnavailable(false);
            })
            .catch(() => {
              window.clearTimeout(cardFieldsFallbackTimer);
              setCardFieldsReady(false);
              setCardFieldsUnavailable(true);
            });
        } else {
          window.clearTimeout(cardFieldsFallbackTimer);
          setCardFieldsReady(false);
          setCardFieldsUnavailable(true);
        }
      } catch {
        window.clearTimeout(cardFieldsFallbackTimer);
        setCardFieldsReady(false);
        setCardFieldsUnavailable(true);
      }
    } else {
      window.clearTimeout(cardFieldsFallbackTimer);
      setCardFieldsUnavailable(true);
    }

    return () => {
      window.clearTimeout(cardFieldsFallbackTimer);
      cardFieldsInstanceRef.current = null;
      if (walletEl) walletEl.innerHTML = '';
      if (cardBtnEl) cardBtnEl.innerHTML = '';
      if (numEl) numEl.innerHTML = '';
      if (expEl) expEl.innerHTML = '';
      if (cvvEl) cvvEl.innerHTML = '';
    };
  }, [isOpen, sdkLoaded, isMasterPass, createServerOrderForSdk, captureAndFulfillOrder]);

  // 4. Automatic background polling when a direct PayPal order is open
  useEffect(() => {
    if (!isOpen || !paypalOrderId) return;

    const timer = window.setInterval(() => {
      void captureAndFulfillOrder(
        paypalOrderId,
        activeTab === 'card_paypal' ? 'Carte Bancaire PayPal' : 'PayPal',
        { silentPoll: true }
      );
    }, 3500);

    return () => {
      window.clearInterval(timer);
    };
  }, [isOpen, paypalOrderId, activeTab, captureAndFulfillOrder]);

  if (!isOpen) return null;

  const handleApplyInlineIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inlineIdentityInput.trim();
    const cleanPass = inlinePasswordInput.trim();
    if (!clean && cleanPass.length < 4) {
      setInlineIdentityFeedback('Entre ton mot de passe seul (4 car. min.) ou un pseudo / code.');
      return;
    }
    if (clean && clean.length < 2) {
      setInlineIdentityFeedback('Entre au moins 2 caractères (ou laisse vide avec ton mot de passe).');
      return;
    }
    setInlineIdentityBusy(true);
    setInlineIdentityFeedback(null);
    try {
      const upper = clean.toUpperCase();
      if (
        !clean ||
        upper.startsWith('EVASION-') ||
        upper.startsWith('USR_') ||
        upper.startsWith('DÉTENU') ||
        upper.startsWith('DETENU')
      ) {
        if (cleanPass.length < 4) {
          setInlineIdentityFeedback('Entre le mot de passe du compte pour te connecter.');
          return;
        }
        const loginRes = await loginAccount(clean, cleanPass);
        if (loginRes.success) {
          setShowInlinePseudoEdit(false);
          setInlinePasswordInput('');
          setPaypalRedirectUrl(null);
          setPaypalOrderId(null);
          return;
        }
        setInlineIdentityFeedback(loginRes.error || 'Identifiant ou mot de passe incorrect.');
        return;
      }

      const res = await connectWithPseudo(clean, user.avatar, cleanPass || undefined);
      if (!res.success) {
        setInlineIdentityFeedback(res.error || 'Impossible de lier ce pseudo.');
        return;
      }
      setShowInlinePseudoEdit(false);
      setInlinePasswordInput('');
      setPaypalRedirectUrl(null);
      setPaypalOrderId(null);
    } finally {
      setInlineIdentityBusy(false);
    }
  };

  // Submit Official PayPal Hosted CardFields
  const handleSubmitPayPalCardFields = async () => {
    if (!cardFieldsInstanceRef.current) return;
    setPaypalError(null);
    setIsSubmittingCardFields(true);
    try {
      const state = await cardFieldsInstanceRef.current.getState?.();
      if (state && state.isFormValid === false) {
        setIsSubmittingCardFields(false);
        setPaypalError('Vérifie le numéro de carte, la date d’expiration (MM/AA) et le code CVV.');
        return;
      }
      await cardFieldsInstanceRef.current.submit(
        cardHolderName.trim() ? { cardholderName: cardHolderName.trim() } : undefined
      );
    } catch {
      setIsSubmittingCardFields(false);
      setPaypalError(
        'Impossible de valider la carte dans ce navigateur. Clique sur « Payer par Carte sur PayPal.com » juste en dessous.'
      );
    }
  };

  // Direct PayPal Redirect Handler (opens PayPal Card Billing or PayPal Account Login)
  const handlePayPalDirectRedirect = async (landingPage: 'BILLING' | 'LOGIN') => {
    const effectivePack = getEffectivePack();
    setPaypalError(null);
    setIsCreatingPaypalOrder(true);
    try {
      const response = await authFetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: effectivePack.id,
          targetPostId: effectivePack.postId || effectivePack.targetPostId,
          neonColor: effectivePack.neonColor,
          cellFrame: effectivePack.cellFrame,
          authorId: user.id,
          matricule: user.matricule,
          alias: user.alias,
          avatar: user.avatar,
          referralCode: user.referralCode,
          landingPage,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        orderId?: string;
        approveUrl?: string | null;
        token?: string;
        account?: any;
        error?: string;
      };
      if (!response.ok || !data.success || !data.orderId) {
        setPaypalError(data?.error || 'Impossible de créer la commande PayPal.');
        return;
      }
      if (data.token) {
        try {
          localStorage.setItem('evasion_auth_token_v1', data.token);
        } catch {
          // ignore
        }
        if (data.account) {
          pendingSessionRef.current = { account: data.account, token: data.token };
        }
      }
      try {
        localStorage.setItem(
          'evasion_pending_paypal_order',
          JSON.stringify({
            orderId: data.orderId,
            item: effectivePack,
            referralCode: data.account?.profile?.referralCode || user.referralCode,
            createdAt: Date.now(),
          })
        );
      } catch {
        // ignore storage errors
      }
      setPaypalOrderId(data.orderId);
      if (data.approveUrl) {
        setPaypalRedirectUrl(data.approveUrl);
      } else {
        setPaypalError('Lien de redirection absent ; utilise le bouton PayPal ci-dessus.');
      }
    } catch {
      setPaypalError('Erreur réseau lors de la création de la commande PayPal.');
    } finally {
      setIsCreatingPaypalOrder(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 backdrop-blur-md animate-fade-in ${
        isLight ? 'bg-slate-900/50' : 'bg-black/80'
      }`}
    >
      <div
        className={`relative w-full max-w-lg rounded-3xl p-4 sm:p-6 shadow-2xl max-h-[94vh] overflow-y-auto no-scrollbar border ${
          isLight
            ? 'bg-white border-zinc-200 text-zinc-900'
            : 'bg-zinc-900 border-zinc-700/80 text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-xs font-bold border ${
                  isLight
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                🔒 Guichet Officiel PayPal ({paypalMode === 'sandbox' ? 'Sandbox' : 'Live EUR'})
              </span>
              <span className={isLight ? 'text-zinc-300 text-xs' : 'text-zinc-500 text-xs'}>·</span>
              <span className={`text-xs font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                ÉVASION
              </span>
            </div>
            <h3
              className={`text-lg sm:text-xl font-black tracking-tight ${
                isLight ? 'text-zinc-900' : 'text-white'
              }`}
            >
              Paiement PayPal · Carte & Compte
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reprendre un Don / Commande PayPal en cours */}
        {pendingDonationOrder && (
          <div
            className={`mb-4 p-3 rounded-2xl border flex flex-col gap-2 ${
              isLight
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg shrink-0">🔄</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">
                    Don / Commande PayPal en cours détecté
                  </p>
                  <p className="text-[11px] font-mono text-zinc-300 truncate">
                    Réf : {pendingDonationOrder.orderId} · {pendingDonationOrder.item?.name || 'Pack ÉVASION'} ({pendingDonationOrder.item?.priceLabel || ''})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('evasion_pending_paypal_order');
                  } catch {}
                  setPendingDonationOrder(null);
                }}
                className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer shrink-0 ml-2"
              >
                Ignorer
              </button>
            </div>
            <button
              type="button"
              disabled={isConfirmingPaypal}
              onClick={() => void captureAndFulfillOrder(pendingDonationOrder.orderId, 'PayPal')}
              className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
            >
              {isConfirmingPaypal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Reprendre ce don & Valider</span>
            </button>
          </div>
        )}

        {/* Selected Item Summary or Pack Selector */}
        {checkoutItem ? (
          <div
            className={`mb-4 p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isLight
                ? 'bg-amber-50 border-amber-300'
                : 'bg-amber-950/25 border-amber-500/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl select-none">{selectedPack.icon}</span>
              <div>
                <div
                  className={`text-xs font-mono uppercase font-bold ${
                    isLight ? 'text-amber-700' : 'text-amber-400'
                  }`}
                >
                  Article sélectionné
                </div>
                <div
                  className={`text-sm sm:text-base font-black ${
                    isLight ? 'text-zinc-900' : 'text-white'
                  }`}
                >
                  {getEffectivePack().name}
                </div>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
                  {getEffectivePack().tagline}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className={`text-lg font-black font-mono ${
                  isLight ? 'text-amber-700' : 'text-amber-400'
                }`}
              >
                {isMasterPass ? '0,00 €' : selectedPack.priceLabel}
              </div>
              <span
                className={`text-[10px] font-mono ${
                  isLight ? 'text-emerald-700' : 'text-emerald-400'
                }`}
              >
                {isMasterPass ? 'Accès Gratuit · 0 €' : 'TTC · Sans engagement'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            <div className={`text-xs font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
              1. Choisis ton pack (Mémoire Univers 🧠, Clés 🔑, Cadenas 🔒 ou Style Néon 🎨) :
            </div>
            <div className="grid grid-cols-1 gap-2">
              {DEFAULT_PACKS.map((pack) => {
                const isSelected = selectedPack.id === pack.id;
                return (
                  <div
                    key={pack.id}
                    onClick={() => {
                      setSelectedPack(pack);
                      setPaypalRedirectUrl(null);
                      setPaypalOrderId(null);
                      setPaypalError(null);
                    }}
                    className={`relative p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? isLight
                          ? 'bg-amber-50 border-amber-400 shadow-sm ring-1 ring-amber-300'
                          : 'bg-amber-950/25 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.18)] ring-1 ring-amber-500/40'
                        : isLight
                        ? 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                        : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl select-none">{pack.icon}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs sm:text-sm font-bold ${
                              isLight ? 'text-zinc-900' : 'text-white'
                            }`}
                          >
                            {pack.name}
                          </span>
                          {pack.keys && (
                            <span
                              className={`text-[11px] font-mono font-bold ${
                                isLight ? 'text-amber-700' : 'text-amber-400'
                              }`}
                            >
                              +{pack.keys} 🔑
                            </span>
                          )}
                          {pack.padlocks && (
                            <span
                              className={`text-[11px] font-mono font-bold ${
                                isLight ? 'text-indigo-700' : 'text-indigo-400'
                              }`}
                            >
                              +{pack.padlocks} 🔒
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[11px] mt-0.5 leading-snug ${
                            isLight ? 'text-zinc-600' : 'text-zinc-400'
                          }`}
                        >
                          {pack.tagline}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div
                        className={`text-sm font-black font-mono ${
                          isLight ? 'text-zinc-900' : 'text-white'
                        }`}
                      >
                        {isMasterPass ? '0,00 €' : pack.priceLabel}
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ml-auto mt-1 ${
                          isLight ? 'border-zinc-300' : 'border-zinc-700'
                        }`}
                      >
                        {isSelected && (
                          <Check
                            className={`w-3 h-3 stroke-[3] ${
                              isLight ? 'text-amber-600' : 'text-amber-400'
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Interactive Neon Color & Cell Frame Picker when Style Néon is active */}
        {isNeonPackSelected && (
          <div
            className={`mb-4 p-3.5 rounded-2xl border space-y-3 ${
              isLight ? 'bg-zinc-50 border-cyan-300' : 'bg-zinc-950 border-cyan-500/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-mono font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                Aperçu & choix du Néon :
              </span>
              <span className={`text-[10px] font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Actuel : {getNeonItem(user.neonColor).shortLabel}
              </span>
            </div>

            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                isLight ? 'bg-white' : 'bg-zinc-900/95'
              } ${getCellFrameClasses(chosenFrame, chosenNeon, theme)}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 overflow-hidden ${
                    isLight ? 'bg-zinc-100' : 'bg-zinc-950'
                  } ${getNeonAvatarRingClass(chosenNeon, theme)}`}
                >
                  <AvatarDisplay avatar={user.avatar} alt={user.alias} />
                </span>
                <div className="min-w-0">
                  <div className={`text-xs font-mono truncate ${getNeonItem(chosenNeon).textClass}`}>
                    {user.matricule}
                  </div>
                  <div className={`text-[11px] font-mono truncate ${getNeonItem(chosenNeon).textClass}`}>
                    @{(user.alias || user.matricule).replace(/\s+/g, '_')}
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${
                  isLight
                    ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                    : 'bg-zinc-950 border-zinc-700 text-zinc-300'
                }`}
              >
                Cadre {CELL_FRAME_OPTIONS.find((f) => f.id === chosenFrame)?.label || chosenFrame}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {NEON_PALETTE.map((col) => {
                const isSelected = chosenNeon === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      setChosenNeon(col.id);
                      setPaypalRedirectUrl(null);
                      setPaypalOrderId(null);
                    }}
                    className={`p-2 rounded-xl text-[11px] font-mono flex items-center gap-1.5 transition-all border cursor-pointer ${
                      isSelected
                        ? `${col.borderClass} ${col.bgClass} ${col.textClass} font-bold shadow-sm`
                        : isLight
                        ? 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dotClass}`} />
                    <span className="truncate">{col.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {CELL_FRAME_OPTIONS.map((fr) => (
                <button
                  key={fr.id}
                  type="button"
                  onClick={() => {
                    setChosenFrame(fr.id);
                    setPaypalRedirectUrl(null);
                    setPaypalOrderId(null);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-mono whitespace-nowrap border transition-all shrink-0 cursor-pointer ${
                    chosenFrame === fr.id
                      ? isLight
                        ? 'border-cyan-600 bg-cyan-50 text-cyan-800 font-bold'
                        : 'border-cyan-400 bg-cyan-500/15 text-cyan-300 font-bold'
                      : isLight
                      ? 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {fr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Facilité Compte : Anonyme, Pseudo ou Code d'évasion directement dans le guichet */}
        {!isMasterPass && (
          <div
            className={`mb-3 p-3 rounded-2xl border ${
              isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/90 border-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-zinc-800/80 flex items-center justify-center text-base shrink-0 overflow-hidden">
                  <AvatarDisplay avatar={user.avatar} alt={user.alias} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-zinc-400">
                    Compte crédité automatiquement
                  </div>
                  <div className="text-xs font-bold truncate">
                    {user.alias && user.alias !== 'Spectre En Quête' ? user.alias : 'Mode Anonyme'} ·{' '}
                    <span className="font-mono text-amber-400">{user.matricule}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowInlinePseudoEdit((v) => !v);
                  setInlineIdentityFeedback(null);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold border transition-colors shrink-0 cursor-pointer flex items-center gap-1 ${
                  isLight
                    ? 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-zinc-500'
                }`}
              >
                <UserCheck className="w-3 h-3 text-emerald-400" />
                <span>{showInlinePseudoEdit ? 'Fermer' : 'Pseudo / Code'}</span>
              </button>
            </div>

            {showInlinePseudoEdit && (
              <form
                onSubmit={handleApplyInlineIdentity}
                className="mt-2.5 pt-2.5 border-t border-zinc-800/70 space-y-2"
              >
                <div className="space-y-2">
                  <input
                    type="text"
                    value={inlineIdentityInput}
                    onChange={(e) => setInlineIdentityInput(e.target.value)}
                    placeholder="Pseudo / Code (optionnel si tu as le mot de passe)"
                    className={`w-full min-w-0 px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                      isLight
                        ? 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400'
                        : 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500'
                    }`}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={inlinePasswordInput}
                      onChange={(e) => setInlinePasswordInput(e.target.value)}
                      placeholder="Mot de passe (suffit pour récupérer ton compte)"
                      className={`flex-1 min-w-0 px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                        isLight
                          ? 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400'
                          : 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={inlineIdentityBusy}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold shrink-0 cursor-pointer"
                    >
                      {inlineIdentityBusy ? '...' : 'Lier'}
                    </button>
                  </div>
                </div>
                {inlineIdentityFeedback && (
                  <p className="text-[11px] font-mono text-amber-400">{inlineIdentityFeedback}</p>
                )}
                <p className="text-[10px] font-mono text-zinc-500">
                  Tu peux laisser le pseudo vide et entrer uniquement ton mot de passe pour retrouver ton compte protégé.
                </p>
              </form>
            )}
          </div>
        )}

        {/* 2. ACCÈS PRIVILÈGE GRATUIT (0 €) OU PAIEMENT PAYPAL COMPLET */}
        {isMasterPass ? (
          <div
            className={`mb-3 p-4 rounded-2xl border space-y-3 ${
              isLight
                ? 'bg-emerald-50 border-emerald-300 text-zinc-900'
                : 'bg-emerald-950/30 border-emerald-500/40 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span
                  className={`text-xs font-mono font-black ${
                    isLight ? 'text-emerald-800' : 'text-emerald-300'
                  }`}
                >
                  Accès Privilège · Tout Gratuit
                </span>
              </div>
              <span className="text-xs font-mono font-black px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950">
                0,00 €
              </span>
            </div>
            <p className={`text-xs leading-relaxed ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
              Aucun paiement requis : active immédiatement « {getEffectivePack().name} » gratuitement sur ton compte.
            </p>
            <button
              type="button"
              disabled={isActivatingFreePass}
              onClick={async () => {
                setIsActivatingFreePass(true);
                try {
                  const ok = await executeFreePassOrder(getEffectivePack());
                  if (ok) onClose();
                } finally {
                  setIsActivatingFreePass(false);
                }
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] active:scale-95 cursor-pointer"
            >
              {isActivatingFreePass ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Activation gratuite en cours...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Débloquer gratuitement maintenant (0 €)</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div
            className={`space-y-3.5 p-4 rounded-2xl border animate-fade-in ${
              isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950 border-zinc-800'
            }`}
          >
            {/* Mode Selector: Par Carte PayPal vs Compte PayPal */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-zinc-900/90 border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('card_paypal');
                  setPaypalError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'card_paypal'
                    ? 'bg-emerald-500 text-zinc-950 shadow-sm font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 shrink-0" />
                <span>Par Carte PayPal</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('account_paypal');
                  setPaypalError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'account_paypal'
                    ? 'bg-[#ffc439] text-zinc-950 shadow-sm font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>🅿️ Compte PayPal</span>
              </button>
            </div>

            {/* Badges moyens de paiement acceptés */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-mono text-zinc-400">
              <div className="flex items-center gap-1 flex-wrap">
                {['CB', 'Visa', 'Mastercard', 'PayPal', '4x PayPal'].map((m) => (
                  <span
                    key={m}
                    className={`px-1.5 py-0.5 rounded border font-bold ${
                      isLight
                        ? 'bg-white border-zinc-300 text-zinc-700'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <span className="text-emerald-400 font-bold">SSL 3D Secure</span>
            </div>

            {!sdkLoaded && !sdkBlocked && (
              <div className="flex items-center justify-center gap-2 py-2 text-xs font-mono text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>Connexion sécurisée au réseau PayPal...</span>
              </div>
            )}

            {/* ==================== TAB 1 : PAR CARTE PAYPAL ==================== */}
            <div
              className={
                activeTab === 'card_paypal'
                  ? 'space-y-3'
                  : 'opacity-0 pointer-events-none h-0 overflow-hidden'
              }
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Carte Bancaire via PayPal (Sans compte requis)</span>
                </span>
                <span className={`font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {getEffectivePack().priceLabel}
                </span>
              </div>

              {/* 1A. Official PayPal Black Card Button (fundingSource: CARD) */}
              <div className={sdkBlocked ? 'hidden' : 'w-full'}>
                <div ref={paypalCardButtonContainerRef} className="w-full min-h-[44px]" />
              </div>

              {/* 1B. Official PayPal Hosted CardFields (masqué automatiquement si non éligible sur ce compte/navigateur) */}
              <div
                className={`${
                  sdkBlocked || (cardFieldsUnavailable && !cardFieldsReady) ? 'hidden' : 'space-y-2.5'
                } p-3 rounded-xl border ${
                  isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900/90 border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>Formulaire Carte Bancaire intégré (3D Secure)</span>
                  <span className="text-emerald-400 font-bold">
                    {cardFieldsReady ? 'Prêt · Sans compte' : 'Initialisation...'}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Titulaire de la carte (optionnel)
                  </label>
                  <input
                    type="text"
                    value={cardHolderName}
                    onChange={(e) => setCardHolderName(e.target.value)}
                    placeholder="Nom figurant sur la carte"
                    className="w-full h-[38px] px-3 rounded-lg bg-white text-zinc-900 border border-zinc-300 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Numéro de carte bancaire
                  </label>
                  <div
                    ref={cardNumberFieldRef}
                    className="w-full min-h-[42px] rounded-lg bg-white border border-zinc-300 px-1 flex items-center overflow-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                      Expiration (MM/AA)
                    </label>
                    <div
                      ref={cardExpiryFieldRef}
                      className="w-full min-h-[42px] rounded-lg bg-white border border-zinc-300 px-1 flex items-center overflow-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                      Cryptogramme CVV
                    </label>
                    <div
                      ref={cardCvvFieldRef}
                      className="w-full min-h-[42px] rounded-lg bg-white border border-zinc-300 px-1 flex items-center overflow-hidden"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!cardFieldsReady || isSubmittingCardFields || isConfirmingPaypal}
                  onClick={handleSubmitPayPalCardFields}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
                >
                  {isSubmittingCardFields || isConfirmingPaypal ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Validation Carte PayPal en cours...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Valider par Carte ({getEffectivePack().priceLabel})</span>
                    </>
                  )}
                </button>
              </div>

              {/* 1C. Bouton Carte Direct PayPal.com (toujours fonctionnel, même si bloqueur / iframe) */}
              <button
                type="button"
                onClick={() => handlePayPalDirectRedirect('BILLING')}
                disabled={isCreatingPaypalOrder}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_18px_rgba(16,185,129,0.25)] active:scale-95 cursor-pointer"
              >
                {isCreatingPaypalOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Création de la page Carte sécurisée...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Payer par Carte sur PayPal.com ({getEffectivePack().priceLabel})</span>
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* ==================== TAB 2 : COMPTE PAYPAL ==================== */}
            <div
              className={
                activeTab === 'account_paypal'
                  ? 'space-y-3'
                  : 'opacity-0 pointer-events-none h-0 overflow-hidden'
              }
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-amber-400">
                  🅿️ Compte PayPal (Solde, 4x sans frais ou Compte lié)
                </span>
                <span className={`font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {getEffectivePack().priceLabel}
                </span>
              </div>

              {/* 2A. Official Gold PayPal Button */}
              <div className={sdkBlocked ? 'hidden' : 'w-full'}>
                <div ref={paypalWalletContainerRef} className="w-full min-h-[44px]" />
              </div>

              {/* 2B. Direct PayPal.com Account Button */}
              <button
                type="button"
                onClick={() => handlePayPalDirectRedirect('LOGIN')}
                disabled={isCreatingPaypalOrder}
                className="w-full py-3 px-4 rounded-xl bg-[#ffc439] hover:bg-[#f4bb30] disabled:opacity-60 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                {isCreatingPaypalOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Préparation de la commande PayPal...</span>
                  </>
                ) : (
                  <>
                    <span>Ouvrir mon Compte PayPal.com ({getEffectivePack().priceLabel})</span>
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Active Redirect Order Panel (with auto-detection + manual trigger) */}
            {paypalRedirectUrl && paypalOrderId && (
              <div className="p-3.5 rounded-xl bg-blue-950/35 border border-blue-500/40 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-mono text-blue-300">
                  <span>Commande PayPal #{paypalOrderId}</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Détection auto active</span>
                  </span>
                </div>

                <a
                  href={paypalRedirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#ffc439] hover:bg-[#f4bb30] text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <span>
                    1. Finaliser sur PayPal.com ({getEffectivePack().priceLabel})
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  disabled={isConfirmingPaypal}
                  onClick={() =>
                    void captureAndFulfillOrder(
                      paypalOrderId,
                      activeTab === 'card_paypal' ? 'Carte Bancaire PayPal' : 'PayPal'
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isConfirmingPaypal ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>2. J’ai payé sur PayPal → Débloquer maintenant</span>
                </button>
              </div>
            )}

            {paypalError && (
              <div
                className={`p-2.5 rounded-xl border text-xs font-mono ${
                  isLight
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-red-950/50 border-red-500/40 text-red-300'
                }`}
              >
                ⚠️ {paypalError}
              </div>
            )}
          </div>
        )}

        {/* Reprendre un don manuellement avec référence PayPal */}
        <div className="pt-2 border-t border-white/10">
          {!showManualOrderIdForm ? (
            <button
              type="button"
              onClick={() => setShowManualOrderIdForm(true)}
              className="w-full text-center text-[11px] font-mono text-zinc-400 hover:text-amber-400 py-1 transition-colors cursor-pointer"
            >
              🔄 Reprendre un don / paiement avec référence PayPal ?
            </button>
          ) : (
            <div className="p-3 rounded-2xl border border-white/10 bg-white/5 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Reprendre un don ou commande</span>
                <button
                  type="button"
                  onClick={() => setShowManualOrderIdForm(false)}
                  className="text-[10px] text-zinc-400 hover:text-white"
                >
                  Fermer
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="ID de commande PayPal (ex: 8XX...)"
                  value={manualOrderIdInput}
                  onChange={(e) => setManualOrderIdInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-white/20 bg-black/40 text-xs font-mono text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={!manualOrderIdInput.trim() || isConfirmingPaypal}
                  onClick={() => {
                    const cleanId = manualOrderIdInput.trim();
                    if (cleanId) void captureAndFulfillOrder(cleanId, 'PayPal');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-mono font-bold text-xs cursor-pointer shrink-0"
                >
                  {isConfirmingPaypal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Vérifier'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-500 pt-3">
          <ShieldCheck
            className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}
          />
          <span>
            Paiement 100% traité par PayPal SSL · Crédit immédiat sur {user.matricule}
          </span>
        </div>
      </div>
    </div>
  );
};
