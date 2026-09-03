import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeFirebaseAnalytics } from './app/core/firebase.config';

bootstrapApplication(App, appConfig)
  .then(() => initializeFirebaseAnalytics())
  .catch((err) => console.error(err));
