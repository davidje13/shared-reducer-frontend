export type Provider<T> = () => T;

export default (): Provider<number> => {
  let id = 0;
  return (): number => {
    id += 1;
    return id;
  };
};
