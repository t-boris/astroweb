import { Link, useParams } from "react-router";

export default function ProfileCreate() {
  const { id } = useParams();
  const isEdit = Boolean(id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {isEdit ? "Edit Profile" : "Create Profile"}
      </h1>
      <p className="text-muted-foreground">
        Profile form coming in Phase 4.
      </p>
      <Link to="/" className="text-primary hover:underline">
        Back
      </Link>
    </div>
  );
}
