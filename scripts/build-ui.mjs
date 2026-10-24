import {build} from "vite";
const surface=process.argv[2]??"desktop";
if(!["desktop","download","admin"].includes(surface))throw Error("Unknown UI surface");
process.env.ONCLASSTIME_SURFACE=surface;
await build();
