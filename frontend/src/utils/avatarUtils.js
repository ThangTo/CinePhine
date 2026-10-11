const DEFAULT_AVATARS = ["avt1.jpg", "avt2.webp", "avt3.jpg", "avt4.jpg", "avt5.jpg"];

const FALLBACK_R2_AVATAR_BASE_URL =
  "https://pub-e00827b92ed84d85a314a9c12ba6f2e7.r2.dev/avatars";

const trimTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const getAvatarBaseUrl = () => {
  if (process.env.REACT_APP_AVATAR_BASE_URL) {
    return trimTrailingSlash(process.env.REACT_APP_AVATAR_BASE_URL);
  }

  if (process.env.REACT_APP_PUBLIC_DOMAIN) {
    return `${trimTrailingSlash(process.env.REACT_APP_PUBLIC_DOMAIN)}/avatars`;
  }

  return trimTrailingSlash(FALLBACK_R2_AVATAR_BASE_URL);
};

const hashString = (str = "") => {
  let hash = 0;
  for (let index = 0; index < str.length; index += 1) {
    hash = str.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

export const getAvatarUrlByKey = (key) => {
  const index = hashString(key || "default") % DEFAULT_AVATARS.length;
  return `${getAvatarBaseUrl()}/${DEFAULT_AVATARS[index]}`;
};

// Halloween costume per user (0 hat, 1 horns, 2 cat ears, 3 bat wings); CSS reads it from data-costume.
export const getAvatarCostume = (name) => hashString(name || "") % 4;

export const getRandomAvatarUrl = () => {
  const randomIndex = Math.floor(Math.random() * DEFAULT_AVATARS.length);
  return `${getAvatarBaseUrl()}/${DEFAULT_AVATARS[randomIndex]}`;
};

const isUrlReachable = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(false);
      return;
    }

    if (src.startsWith("data:image")) {
      resolve(src.startsWith("data:image/") && src.includes(","));
      return;
    }

    if (!src.startsWith("http://") && !src.startsWith("https://")) {
      resolve(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    fetch(src, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        clearTimeout(timeout);
        resolve(response.ok || response.status < 400);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
  });

export const handleAvatarError = async (event) => {
  const image = event.currentTarget || event.target;
  if (!image || image.dataset.fallbackApplied) {
    return;
  }

  const originalSrc = image.currentSrc || image.src || "";
  const reachable = await isUrlReachable(originalSrc);
  if (reachable) {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.src = getAvatarUrlByKey(image.alt || "default");
};

export const normalizeAvatarFile = (
  file,
  { maxDimension = 512, quality = 0.86, outputType = "image/webp" } = {}
) =>
  new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error("Invalid avatar file"));
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Invalid avatar file type"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const longestSide = Math.max(image.width, image.height) || 1;
      const scale = Math.min(1, maxDimension / longestSide);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to process avatar image"));
        return;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);

          if (!blob) {
            reject(new Error("Unable to normalize avatar image"));
            return;
          }

          resolve(
            new File([blob], `avatar-${Date.now()}.webp`, {
              type: outputType,
              lastModified: Date.now(),
            })
          );
        },
        outputType,
        quality
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read avatar image"));
    };

    image.src = objectUrl;
  });
