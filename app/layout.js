import "./globals.css";

export const metadata = {
  title: "DispatchAnswer — Never miss another after-hours call",
  description:
    "AI answering service for HVAC contractors. Books jobs 24/7 so you never lose a customer to voicemail. Hear it for yourself — get a live demo call in seconds.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
