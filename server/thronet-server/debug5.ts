console.log("Importing server...");
import('./server.ts').then(() => {
    console.log("Server imported successfully!");
}).catch(err => {
    console.error("Error importing server:", err);
});
