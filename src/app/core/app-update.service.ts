import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly checkIntervalMs = 60_000;
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    if (!this.updates.isEnabled) {
      return;
    }

    this.updates.versionUpdates.subscribe((event) => {
      void this.handleVersionEvent(event);
    });

    window.addEventListener('focus', () => {
      void this.checkNow();
    });

    window.addEventListener('online', () => {
      void this.checkNow();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.checkNow();
      }
    });

    setInterval(() => {
      void this.checkNow();
    }, this.checkIntervalMs);

    void this.checkNow();
  }

  private async handleVersionEvent(event: VersionEvent): Promise<void> {
    if (event.type !== 'VERSION_READY') {
      return;
    }

    await this.activateAndReload();
  }

  private async activateAndReload(): Promise<void> {
    try {
      await this.updates.activateUpdate();
    } catch {
      // Ignore and continue with hard reload.
    }

    window.location.reload();
  }

  private async checkNow(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch {
      // Ignore service worker update errors.
    }

    try {
      await this.updates.checkForUpdate();
    } catch {
      // Ignore check errors and retry on next cycle.
    }
  }
}
