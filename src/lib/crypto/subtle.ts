const subtle = typeof(window) !== 'undefined' && 'crypto' in window ? window.crypto.subtle : self.crypto.subtle;

export default subtle;
