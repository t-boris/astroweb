import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import ProfileCreate from "@/pages/ProfileCreate";
import ProfileDetail from "@/pages/ProfileDetail";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/profile/new" element={<ProfileCreate />} />
          <Route path="/profile/:id" element={<ProfileDetail />} />
          <Route path="/profile/:id/edit" element={<ProfileCreate />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
