import { ThunderboltFilled } from "@ant-design/icons";

const BrandMark: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <span
    className="brand-mark"
    style={{ width: size, height: size, borderRadius: size * 0.3, fontSize: size * 0.5 }}
  >
    <ThunderboltFilled />
  </span>
);

export default BrandMark;
