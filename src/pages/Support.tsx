import { Headphones, Mail } from "lucide-react";
import { PhoneCard } from "../components/phone/PhoneUi";

const SUPPORT_EMAIL = "support@trade2smart.com";

export function Support() {
  return (
    <div className="desk-page mx-auto max-w-2xl space-y-2" data-support-page="true">
      <div>
        <h1 className="text-xl font-bold">Support</h1>
        <p className="text-sm text-slate-400">Email Trade 2 Smart for desk help.</p>
      </div>
      <PhoneCard className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <Headphones size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold">Contact support</div>
            <p className="mt-1 text-sm text-slate-400">We reply on this mailbox.</p>
          </div>
        </div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 flex items-center gap-2 text-base font-bold text-brand-500"
          data-support-email={SUPPORT_EMAIL}
        >
          <Mail size={16} />
          {SUPPORT_EMAIL}
        </a>
      </PhoneCard>
    </div>
  );
}
