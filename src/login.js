import "./shared/style.css";
import { safeNext } from "./auth/gate-shared.js";

const params = new URLSearchParams(location.search);
document.querySelector("#next").value = safeNext(params.get("next"));
document.querySelector("#fehler").hidden = params.get("fehler") !== "1";
