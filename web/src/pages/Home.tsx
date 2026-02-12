import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
      <p className="text-muted-foreground">
        No profiles yet. Create your first one!
      </p>
      <Button asChild>
        <Link to="/profile/new">Create Profile</Link>
      </Button>
    </div>
  );
}
