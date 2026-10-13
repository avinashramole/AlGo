import { MemberAccountSetup } from "../components/desk/MemberAccountSetup";

export function MemberBroker() {
  return (
    <div className="mx-auto max-w-2xl space-y-2" data-member-broker-page="true">
      <div>
        <h1 className="text-xl font-bold">Add broker</h1>
        <p className="text-sm text-slate-400">Connect Dhan, Upstox, or another broker for live copy.</p>
      </div>
      <MemberAccountSetup showProfile={false} />
    </div>
  );
}
