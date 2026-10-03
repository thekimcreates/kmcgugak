"use strict";

(() => {
    const store = window.KMCDataStore;
    if (!store) {
        console.error("KMC shared data store was not loaded before home-data.js.");
        return;
    }

    // Compatibility facade for the existing homepage renderers.
    window.KMCHomeData = Object.freeze({
        cachedValue: store.cachedValue,
        changed: store.changed,
        writeCache: store.writeCache,
        getHomeContent: store.getHomeContent,
        getArrangements: store.getArrangements,
        getHomePerformances: store.getHomePerformances,
        getLatestPerformances: store.getLatestPerformances
    });
})();
