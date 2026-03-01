# 📸 SnapCBZ

**SnapCBZ** est une application de bureau open-source puissante et élégante, conçue pour télécharger, organiser et archiver facilement des galeries d'images, des mangas et des comics depuis internet.

Développée avec les technologies web modernes (Electron, React, Vite, Tailwind CSS), elle offre une interface fluide, rapide et hautement personnalisable.

---

## ✨ Fonctionnalités Principales

### 📥 Deux Modes de Téléchargement
- **Mode Manga/Comic (.cbz) :** Collez des liens d'artistes ou de galeries. L'application scanne les pages, filtre les contenus selon vos langues préférées, télécharge les images et les empaquette automatiquement en archives `.cbz` prêtes à être lues.
- **Mode Image Board (Images Directes) :** Collez des liens de tags d'Image Boards. L'application télécharge les images directement et les classe intelligemment dans des dossiers par "Copyright" ou "Personnage".

### ⚡ Performances & Multitâche
- Téléchargements simultanés avec file d'attente intelligente.
- Barres de progression en temps réel (scan, téléchargement, extraction, conversion).
- Gestion automatique des doublons pour éviter de télécharger deux fois le même fichier.

### 🎨 Interface & Personnalisation
- **3 Thèmes :** Clair, Sombre, et Noir (idéal pour les écrans OLED).
- **Couleurs d'accentuation :** Choisissez parmi plusieurs couleurs (Turquoise, Bleu, Violet, Rose, Orange, Émeraude) ou définissez votre propre couleur personnalisée.
- **Fonds d'écran :** Possibilité d'ajouter une image de fond personnalisée pour le thème clair.

### 🌍 Multilingue
L'interface est entièrement traduite en 8 langues :
🇫🇷 Français | 🇬🇧 Anglais | 🇹🇷 Turc | 🇩🇪 Allemand | 🇪🇸 Espagnol | 🇵🇹 Portugais | 🇮🇹 Italien | 🇸🇦 Arabe

### 🔄 Mises à jour automatiques
L'application intègre un système de mise à jour automatique. Un simple clic sur "Vérifier les mises à jour" permet de télécharger et d'installer la dernière version disponible sur GitHub.

---

## 💻 Systèmes d'exploitation supportés

- **Windows** (10 / 11)
- **Linux** (Ubuntu, Debian, Fedora, Arch, etc.)
*(Note : macOS n'est pas supporté).*

---

## 🚀 Installation

### Pour les utilisateurs (Recommandé)
1. Allez dans la section **[Releases](../../releases)** de ce dépôt GitHub.
2. **Windows :** Téléchargez et exécutez le fichier `.exe` (Setup ou Portable).
3. **Linux :** Téléchargez le fichier `.AppImage` (le rendre exécutable) ou utilisez les paquets `.deb` / `.rpm`. Un script `install.sh` est également fourni dans le code source.

### Pour les développeurs (Compiler depuis les sources)
Assurez-vous d'avoir [Node.js](https://nodejs.org/) installé sur votre machine.

```bash
# 1. Cloner le dépôt
git clone https://github.com/davidharputoglu/SnapCBZ.git
cd SnapCBZ

# 2. Installer les dépendances
npm install

# 3. Lancer en mode développement
npm run electron:dev

# 4. Compiler l'application
npm run build:win    # Pour créer l'exécutable Windows
npm run build:linux  # Pour créer les exécutables Linux
```

---

## ⚠️ Avertissement Légal (Disclaimer)

**SnapCBZ** est un outil logiciel open-source fourni à des fins éducatives et d'archivage personnel uniquement. 

En utilisant ce logiciel, vous acceptez d'être l'unique responsable de vos actions. L'auteur de ce logiciel ne promeut ni ne cautionne le piratage. Vous devez vous assurer que vous possédez les droits nécessaires ou l'autorisation explicite des créateurs/ayants droit pour télécharger des œuvres protégées par le droit d'auteur. 

*Veuillez consulter le fichier `DISCLAIMER.md` pour lire l'avertissement complet dans votre langue.*

---

## 📄 Licence

Ce projet est sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

---
**Créé avec ❤️ par [David HARPUTOGLU](https://github.com/davidharputoglu)**
