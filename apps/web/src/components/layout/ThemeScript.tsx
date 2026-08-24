/**
 * Applies the stored theme before first paint. Without this the page renders in
 * the system theme for a frame and then snaps to the chosen one.
 */
export function ThemeScript() {
  const code = `try{var t=localStorage.getItem('mada-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
