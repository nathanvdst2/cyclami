import { Component } from 'react';
import { reportError } from '../lib/errors.js';
import { t } from '../i18n/index.js';
import { illu } from '../lib/illustrations.js';

// Si un écran plante, on affiche un message au lieu d'une page blanche, et l'erreur est signalée.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportError(error, info?.componentStack || '');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-emerald-50 px-6 text-center">
        <img src={illu('erreur')} alt="" className="h-40 w-40 object-contain" />
        <h1 className="text-xl font-extrabold text-stone-800">{t('Oups, quelque chose a planté')}</h1>
        <p className="text-sm text-stone-600">{t('L’équipe a été prévenue automatiquement. Recharge la page pour continuer.')}</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>{t('Recharger')}</button>
      </div>
    );
  }
}
