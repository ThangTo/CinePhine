// Shared Tailwind class strings for Account components

export const cardStyles = {
  container:
    "bg-account-bg-secondary border border-account-border rounded-xl mb-2 md:mb-8 overflow-hidden",
  header: "px-6 py-5 border-b border-account-border",
  headerTitle: "m-0 text-xl font-semibold",
  body: "p-2 md:p-6",
  footer: "px-6 py-5 bg-account-bg-tertiary border-t border-account-border flex justify-end",
};

export const buttonStyles = {
  base: "px-4 py-2.5 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all font-inherit",
  primary:
    "bg-account-accent text-[#121212] hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "bg-account-bg-tertiary text-account-text-primary border border-account-border text-xs hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed",
  dangerOutline:
    "bg-transparent text-[#ff6b6b] border border-[#ff6b6b] text-xs hover:bg-[#ff6b6b] hover:text-account-text-primary disabled:opacity-50 disabled:cursor-not-allowed",
};

export const formStyles = {
  group: "mb-5",
  label: "block text-sm font-medium text-account-text-secondary mb-2",
  control:
    "w-full px-3 py-3 bg-account-bg-tertiary border border-account-border rounded-lg text-account-text-primary text-[15px] box-border font-inherit focus:outline-none focus:border-account-accent focus:shadow-[0_0_0_2px_rgb(var(--ui-loading)/0.3)] disabled:bg-[#2a2a2a] disabled:text-account-text-secondary disabled:cursor-not-allowed",
  hint: "block mt-1.5 text-xs text-account-text-secondary",
  error: "block mt-1.5 text-xs text-[#ff6b6b]",
};

export const modalStyles = {
  overlay:
    "fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[10000] p-5",
  content:
    "bg-account-bg-secondary border border-account-border rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto animate-modal-slide-in",
  header: "px-6 py-5 border-b border-account-border flex justify-between items-center",
  headerTitle: "m-0 text-xl font-semibold",
  close:
    "bg-transparent border-none text-account-text-secondary text-xl cursor-pointer p-1 flex items-center justify-center w-8 h-8 rounded-md transition-all hover:bg-account-bg-tertiary hover:text-account-text-primary",
  body: "p-6",
  footer: "px-6 py-5 bg-account-bg-tertiary border-t border-account-border flex justify-end gap-3",
};

const sharedStyles = {
  cardStyles,
  buttonStyles,
  formStyles,
  modalStyles,
};

export default sharedStyles;
