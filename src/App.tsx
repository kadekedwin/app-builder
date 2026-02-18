import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import CreateAppOnboarding from './pages/CreateAppOnboarding';
import AppDetails from './pages/AppDetails';
import BluetoothConsole from './pages/BluetoothConsole';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateAppOnboarding />} />
        <Route path="/app/:id" element={<AppDetails />} />
        <Route path="/bluetooth" element={<BluetoothConsole />} />
      </Routes>
    </HashRouter>
  );
}

export default App
