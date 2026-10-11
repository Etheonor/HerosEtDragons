/** Ouvre le sélecteur de fichiers natif (input créé à la volée). */
export function pickFile(accept: string, onPick: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onPick(f);
  };
  input.click();
}

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
