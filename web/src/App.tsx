import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import ProfileCreate from "@/pages/ProfileCreate";
import ProfileDetail from "@/pages/ProfileDetail";
import AstrologerNotes from "@/pages/AstrologerNotes";
import Letters from "@/pages/Letters";
import AstrologerHub from "@/pages/AstrologerHub";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/profile/new" element={<ProfileCreate />} />
          <Route path="/profile/:id" element={<ProfileDetail />} />
          <Route path="/profile/:id/edit" element={<ProfileCreate />} />
          <Route path="/profile/:id/notes" element={<AstrologerNotes />} />
          <Route path="/profile/:id/letters" element={<Letters />} />
          <Route path="/profile/:id/astrologer" element={<AstrologerHub />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
