import type { ScreenshotSource } from '../lib/matching';
import { Dialog } from './Dialog';

const inventoryExample = '/images/import/inventory-weapons.png';

export function ScreenshotHelp({ source, onClose }: { source: ScreenshotSource; onClose: () => void }) {
  return <Dialog title={source === 'inventory' ? 'Inventory screenshots' : 'Arsenal screenshots'} onClose={onClose} className="screenshot-help-dialog">
    {source === 'inventory' ? <>
      <ol className="screenshot-instructions">
        <li><strong>Open your weapon inventory.</strong><p>In your Orbiter, open the pause menu, then <b>Equipment → Inventory</b>. Select the <b>Weapons</b> tab with the gun icon.</p></li>
        <li><strong>Show the weapons you own.</strong><p>Clear the search field and leave <b>Only Sellable</b> unchecked. You should see the weapon grid below. Stay on this screen; taking screenshots does not require selecting or selling anything.</p></li>
      </ol>
      <figure className="screenshot-example">
        <img src={inventoryExample} width={1920} height={1200} alt="Warframe Inventory/Sell screen with the Weapons tab selected, showing weapon cards including Tonkor, Boltor, and Braton Prime with rank labels. The bottom row is cut off." />
        <figcaption><span>Inventory → Weapons. Capture the cut-off bottom row in your next screenshot.</span><a href={inventoryExample} target="_blank" rel="noreferrer">Open full-size example</a></figcaption>
      </figure>
      <ol className="screenshot-instructions" start={3}>
        <li><strong>Capture the visible rows.</strong><p>Use your computer’s screenshot tool with the game’s text in English. Keep the full weapon names, variant names, and rank labels visible. Save the original image as PNG, JPG, or WebP.</p></li>
        <li><strong>Scroll and repeat.</strong><p>Scroll down with one row overlapping the previous screenshot, then capture again. Continue to the bottom of the list. Overlapping weapons are merged during review.</p></li>
        <li><strong>Add the images here.</strong><p>Return to the <b>Inventory</b> section. Drop your screenshots onto its upload area or click it to choose files. To paste an image, focus that area and paste. Use <b>Add screenshots</b> to add more to the same batch, including while reading is in progress. Add up to 10 images per batch, each below 20 MB and 32 megapixels.</p></li>
        <li><strong>Review before importing.</strong><p>Compare names, variants, and ranks with your screenshots. Reaching a weapon’s maximum rank checks <b>Mastered</b>: usually 30, or 40 for weapons such as Paracesis. Modular weapons and Amps need mastery review. Correct or deselect incorrect matches, then click <b>Import</b>. Previously recorded mastery is preserved even if the current rank is lower.</p></li>
      </ol>
    </> : <ol className="screenshot-instructions">
      <li><strong>Open a weapon selection screen.</strong><p>Open the <b>Arsenal</b>, choose a Primary, Secondary, or Melee weapon slot, then select <b>Equip</b> to display its weapon list.</p></li>
      <li><strong>Capture readable names.</strong><p>Use the game’s English text and keep full names, variants, and rank labels visible. Scroll through the list, capturing each set of rows with a row of overlap. Repeat for the other weapon slots you want to import.</p></li>
      <li><strong>Add the images to Arsenal.</strong><p>Drop or choose your images in the <b>Arsenal</b> section. To paste an image, focus its upload area first. Use <b>Add screenshots</b> to keep adding to the same batch. Use PNG, JPG, or WebP, up to 10 images per batch, each below 20 MB and 32 megapixels.</p></li>
      <li><strong>Confirm ownership and import.</strong><p>Arsenal lists can include weapons you do not own, so <b>Owned</b> starts unchecked. Check it only for weapons you own. Review every name, variant, and rank. <b>Mastered</b> is checked at the catalog’s maximum rank, usually 30 or 40; modular weapons and Amps need mastery review. Correct or deselect incorrect matches before clicking <b>Import</b>.</p></li>
    </ol>}
    <div className="dialog-footer"><button type="button" className="button secondary" onClick={onClose}>Close instructions</button></div>
  </Dialog>;
}
