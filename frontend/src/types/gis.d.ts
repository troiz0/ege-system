// Декларации Google Identity Services (GIS) — Sign in with Google.
// Загружается динамически с https://accounts.google.com/gsi/client

interface GoogleIdInitializeOptions {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  ux_mode?: 'popup' | 'redirect';
}

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleRenderButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'continue_with' | 'signup_with';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface GoogleIdApi {
  initialize(options: GoogleIdInitializeOptions): void;
  renderButton(container: HTMLElement, options: GoogleRenderButtonOptions): void;
  prompt(callback?: (notification: unknown) => void): void;
  cancel(): void;
  disableAutoSelect(): void;
}

interface GoogleAccountsApi {
  id: GoogleIdApi;
}

interface Window {
  google?: {
    accounts: GoogleAccountsApi;
  };
}
