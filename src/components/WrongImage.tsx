import { useEffect, useState } from "react";
import { wrongImageBlob } from "../services/images";

export function WrongImage({
  id,
  bytes,
  alt,
  className,
}: {
  id: string;
  bytes: number;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState(""),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (bytes <= 2 * 1024 * 1024) return;
    const controller = new AbortController();
    let objectUrl = "";
    setError(false);
    setSrc("");
    wrongImageBlob(id, bytes, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, bytes, retry]);
  if (bytes <= 2 * 1024 * 1024)
    return (
      <img
        className={className}
        loading="lazy"
        src={`/api/wrongs/${id}/image`}
        alt={alt}
      />
    );
  if (!src)
    return (
      <span
        className={className}
        role="status"
        onClick={(e) => {
          if (error) {
            e.stopPropagation();
            setRetry((v) => v + 1);
          }
        }}
      >
        {error ? "图片读取失败，点击重试" : "正在加载原图…"}
      </span>
    );
  return <img className={className} src={src} alt={alt} />;
}
