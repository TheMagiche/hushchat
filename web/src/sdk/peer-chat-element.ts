export class PeerChatElement extends HTMLElement {
  static get observedAttributes() {
    return ['room', 'user-name', 'color-mode'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const room = encodeURIComponent(this.getAttribute('room') || 'general');
    const name = encodeURIComponent(this.getAttribute('user-name') || 'Guest');
    const theme = encodeURIComponent(this.getAttribute('color-mode') || 'dark');

    const src = `/embed?room=${room}&name=${name}&theme=${theme}`;

    this.innerHTML = `
      <iframe
        src="${src}"
        width="100%"
        height="100%"
        frameborder="0"
        allow="camera; microphone; display-capture"
        style="border: none; border-radius: 12px; width: 100%; height: 100%; min-height: 400px;"
      ></iframe>
    `;
  }
}

if (typeof window !== 'undefined' && !customElements.get('peer-chat')) {
  customElements.define('peer-chat', PeerChatElement);
}
