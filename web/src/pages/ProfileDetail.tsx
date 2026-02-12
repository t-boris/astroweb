import { useParams } from "react-router";

export default function ProfileDetail() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Profile Detail
      </h1>
      <p className="text-muted-foreground">
        Profile ID: {id}
      </p>
      <p className="text-muted-foreground">
        Chart and details coming in Phase 5.
      </p>
    </div>
  );
}
