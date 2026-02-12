import { Button } from "@/components/ui/button";

function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">AstroWeb</h1>
      <p className="text-muted-foreground text-lg">
        Natal astrology chart computation and visualization
      </p>
      <Button variant="default" size="lg">
        Get Started
      </Button>
    </div>
  );
}

export default App;
