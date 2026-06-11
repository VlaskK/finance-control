import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { appStarted } from './app/model';
import './app/styles.css';

appStarted();

createRoot(document.getElementById('root')!).render(<App />);
