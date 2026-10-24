import { createRoot } from "react-dom/client";
import App from "@product-entry";
import "./styles.css";
import "./library.css";
import "./download.css";
import "./brand.css";
import "./welcome.css";
import "katex/dist/katex.min.css";
createRoot(document.getElementById("root")!).render(<><App /><div className="product-watermark">Power By ONtimeclass</div></>);
