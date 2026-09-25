import styles from '@components/instantView.module.scss';

if(import.meta.hot) {
  // Dev CSS-module names are stable, so a stylesheet update can stop here:
  // Vite swaps the style without invalidating imperative consumers.
  import.meta.hot.accept('@components/instantView.module.scss', () => undefined);
}

export default styles;
