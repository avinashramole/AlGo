import { MemberAccountSetup } from "../components/desk/MemberAccountSetup";

export function MemberSettings() {
  return (
    <div className="desk-page mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400">
          Add your broker and static IP here. Profile stays name, email, and mobile only.
        </p>
      </div>
      <MemberAccountSetup showProfile={false} />
    </div>
  );
}
