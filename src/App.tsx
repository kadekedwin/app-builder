import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import CreateAppOnboarding from './pages/CreateAppOnboarding';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateAppOnboarding />} />
      </Routes>
    </HashRouter>
  );
}

export default App
