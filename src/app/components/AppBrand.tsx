import { Button } from '@leaf/ui/primitives/button';

export function AppBrand({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="app-brand" aria-label="Leaf 我的书架" onClick={onClick}>
      <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" width="24" height="24" />
      <span>Leaf</span>
    </Button>
  );
}
