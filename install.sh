#!/bin/bash

# ==========================================
# Script d'installation pour SnapCBZ (Linux)
# ==========================================

# Remplacez ceci par votre vrai dépôt GitHub une fois publié (ex: "davidharputoglu/SnapCBZ")
GITHUB_REPO="davidharputoglu/SnapCBZ"

echo "========================================"
echo " Bienvenue dans l'installateur SnapCBZ  "
echo "========================================"
echo ""

# 1. Détection de la distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_LIKE=$ID_LIKE
else
    echo "Erreur : Impossible de détecter la distribution Linux."
    exit 1
fi

echo "Distribution détectée : $PRETTY_NAME"
echo ""

# 2. Définition des choix selon la distribution
declare -a OPTIONS
if [[ "$OS" == "ubuntu" || "$OS" == "debian" || "$OS_LIKE" == *"debian"* || "$OS_LIKE" == *"ubuntu"* || "$OS" == "linuxmint" ]]; then
    echo "Système basé sur Debian détecté."
    OPTIONS=("Paquet .deb (Recommandé)" "AppImage (Portable)" "Archive .tar.gz" "Docker / Podman (latest-linux.yml)" "Code Source" "Quitter")
    DISTRO_TYPE="debian"
elif [[ "$OS" == "fedora" || "$OS" == "centos" || "$OS_LIKE" == *"fedora"* || "$OS_LIKE" == *"rhel"* ]]; then
    echo "Système basé sur Fedora/RHEL détecté."
    OPTIONS=("Paquet .rpm (Recommandé)" "AppImage (Portable)" "Archive .tar.gz" "Docker / Podman (latest-linux.yml)" "Code Source" "Quitter")
    DISTRO_TYPE="fedora"
else
    echo "Système Linux générique détecté."
    OPTIONS=("AppImage (Portable)" "Archive .tar.gz" "Docker / Podman (latest-linux.yml)" "Code Source" "Quitter")
    DISTRO_TYPE="other"
fi

echo "Veuillez choisir le format d'installation souhaité :"

# 3. Affichage du menu
PS3="Entrez le numéro de votre choix : "
select opt in "${OPTIONS[@]}"; do
    case "$opt" in
        "Paquet .deb (Recommandé)")
            echo ""
            echo "--> Préparation de l'installation .deb..."
            echo "Téléchargement depuis GitHub..."
            # wget -q --show-progress https://github.com/$GITHUB_REPO/releases/latest/download/SnapCBZ.deb
            # sudo apt install ./SnapCBZ.deb
            break
            ;;
        "Paquet .rpm (Recommandé)")
            echo ""
            echo "--> Préparation de l'installation .rpm..."
            echo "Téléchargement depuis GitHub..."
            # wget -q --show-progress https://github.com/$GITHUB_REPO/releases/latest/download/SnapCBZ.rpm
            # sudo dnf install ./SnapCBZ.rpm
            break
            ;;
        "AppImage (Portable)")
            echo ""
            echo "--> Préparation de l'AppImage..."
            echo "Téléchargement depuis GitHub..."
            # wget -q --show-progress https://github.com/$GITHUB_REPO/releases/latest/download/SnapCBZ.AppImage
            # chmod +x SnapCBZ.AppImage
            # echo "L'AppImage est prête. Vous pouvez la lancer avec ./SnapCBZ.AppImage"
            break
            ;;
        "Archive .tar.gz")
            echo ""
            echo "--> Préparation de l'installation via .tar.gz..."
            echo "Téléchargement depuis GitHub..."
            # wget -q --show-progress https://github.com/$GITHUB_REPO/releases/latest/download/SnapCBZ.tar.gz
            # sudo mkdir -p /opt/SnapCBZ
            # sudo tar -xzf SnapCBZ.tar.gz -C /opt/SnapCBZ --strip-components=1
            # sudo ln -sf /opt/SnapCBZ/snapcbz /usr/local/bin/snapcbz
            # echo "Installation terminée ! Lancez l'application avec la commande 'snapcbz'."
            break
            ;;
        "Docker / Podman (latest-linux.yml)")
            echo ""
            echo "--> Préparation de l'installation via Docker/Podman..."
            echo "Téléchargement de latest-linux.yml..."
            # wget -q --show-progress https://github.com/$GITHUB_REPO/releases/latest/download/latest-linux.yml
            echo "Note : L'intégration Docker/Podman nécessite de configurer un conteneur basé sur ce fichier."
            echo "Consultez la documentation pour plus de détails."
            break
            ;;
        "Code Source")
            echo ""
            echo "--> Téléchargement du code source..."
            echo "git clone https://github.com/$GITHUB_REPO.git"
            echo "cd SnapCBZ && npm install && npm run dev"
            break
            ;;
        "Quitter")
            echo "Annulation de l'installation."
            exit 0
            ;;
        *) 
            echo "Option invalide. Veuillez réessayer."
            ;;
    esac
done

echo ""
echo "========================================================================="
echo " IMPORTANT : Ce script est prêt dans sa structure."
echo " Une fois que vous aurez publié l'application sur GitHub Releases,"
echo " ouvrez ce fichier (install.sh) avec un éditeur de texte, remplacez"
echo " 'davidharputoglu/SnapCBZ' par votre vrai nom d'utilisateur, et décommentez"
echo " (enlevez le #) les lignes de commandes wget, apt, dnf, tar, etc."
echo "========================================================================="
